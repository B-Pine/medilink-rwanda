import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';

import '../../app/config.dart';
import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../data/session.dart';
import '../../ui/band.dart';
import '../../ui/feedback.dart';

/// The live tracker: the ticket grows into this page. Refreshes every 15 s while open.
class TicketScreen extends ConsumerStatefulWidget {
  const TicketScreen({super.key, required this.visitId});

  final String visitId;

  @override
  ConsumerState<TicketScreen> createState() => _TicketScreenState();
}

class _TicketScreenState extends ConsumerState<TicketScreen> {
  Timer? _poll;
  String? _lastState;

  @override
  void initState() {
    super.initState();
    _poll = Timer.periodic(AppConfig.trackerPoll, (_) => ref.invalidate(activeVisitsProvider));
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _leave(ActiveVisit visit) async {
    final s = S.of(context);
    if (!await confirmDanger(context, title: s.leaveQueue, action: s.cancel)) return;
    try {
      await ref.read(apiProvider).post('/api/v1/patient/visits/${visit.id}/cancel/', {'version': visit.version});
      ref.invalidate(activeVisitsProvider);
      if (mounted) context.go('/visits');
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.detail.isNotEmpty ? e.detail : s.somethingWrong)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final visits = ref.watch(activeVisitsProvider);
    final visit = visits.value?.data.where((v) => v.id == widget.visitId).firstOrNull;
    if (visit != null && visit.state != _lastState) {
      if (visit.isCalled && _lastState != null) HapticFeedback.heavyImpact();
      _lastState = visit.state;
    }
    final called = visit?.isCalled ?? false;
    final size = MediaQuery.sizeOf(context);

    return Scaffold(
      backgroundColor: Palette.forest,
      appBar: AppBar(
        leading: const BackButton(),
        actions: [
          if (visits.value?.offline ?? false)
            const Padding(
              padding: EdgeInsets.only(right: Space.lg),
              child: Icon(PhosphorIconsRegular.wifiSlash, color: Palette.onForestMuted),
            ),
        ],
      ),
      body: Stack(
        children: [
          ForestBand(height: size.height, curve: 0),
          if (visit == null)
            Center(
              child: visits.isLoading
                  ? const Skeleton(width: 200, height: 120, onForest: true, radius: 16)
                  : EmptyState(icon: PhosphorIconsRegular.ticket, text: s.done),
            )
          else
            SafeArea(
              child: ListView(
                padding: const EdgeInsets.all(Space.xl),
                children: [
                  Hero(
                    tag: 'ticket-${visit.id}',
                    child: Material(
                      color: called ? Palette.ochre : Palette.surface,
                      borderRadius: BorderRadius.circular(20),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: Space.xxl, horizontal: Space.xl),
                        child: Column(
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const LiveDot(color: Palette.brand),
                                const SizedBox(width: 6),
                                Text(
                                  called ? s.yourTurn.toUpperCase() : s.ticket.toUpperCase(),
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    letterSpacing: 1.4,
                                    color: called ? Palette.forest : Palette.muted,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: Space.md),
                            Text(
                              visit.ticket,
                              style: theme.textTheme.displayLarge?.copyWith(fontSize: 64, color: Palette.forest),
                            ),
                            const SizedBox(height: Space.sm),
                            Text(
                              called && visit.servicePoint != null
                                  ? visit.servicePoint!
                                  : s.state(visit.state),
                              style: theme.textTheme.titleMedium?.copyWith(color: Palette.forest),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: Space.xl),
                  if (!called)
                    Row(
                      children: [
                        _Stat(value: '${visit.ahead}', label: s.ahead),
                        const SizedBox(width: Space.md),
                        _Stat(
                          value: fmt.waitRange(visit.estimate.min, visit.estimate.max, s) ?? '—',
                          label: '≈',
                          accent: true,
                        ),
                      ],
                    ),
                  const SizedBox(height: Space.xl),
                  _InfoRow(icon: PhosphorIconsRegular.buildings, text: visit.facilityName),
                  _InfoRow(icon: PhosphorIconsRegular.stethoscope, text: s.pick(visit.service)),
                  if (visit.patientName.isNotEmpty) _InfoRow(icon: PhosphorIconsRegular.user, text: visit.patientName),
                  const SizedBox(height: Space.xxl),
                  if (visit.state == 'waiting')
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Palette.forestRaised),
                      ),
                      onPressed: () => _leave(visit),
                      child: Text(s.leaveQueue.replaceAll('?', '')),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label, this.accent = false});
  final String value, label;
  final bool accent;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(Space.lg),
          decoration: BoxDecoration(color: Palette.forestRaised, borderRadius: BorderRadius.circular(Space.radius)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 350),
                transitionBuilder: (child, a) => SlideTransition(
                  position: Tween(begin: const Offset(0, 0.5), end: Offset.zero).animate(a),
                  child: FadeTransition(opacity: a, child: child),
                ),
                child: Text(
                  value,
                  key: ValueKey(value),
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        color: accent ? Palette.ochre : Colors.white,
                      ),
                ),
              ),
              Text(label, style: const TextStyle(color: Palette.onForestMuted)),
            ],
          ),
        ),
      );
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => text.isEmpty
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.symmetric(vertical: Space.sm),
          child: Row(
            children: [
              Icon(icon, color: Palette.onForestMuted, size: 20),
              const SizedBox(width: Space.md),
              Expanded(child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 15))),
            ],
          ),
        );
}
