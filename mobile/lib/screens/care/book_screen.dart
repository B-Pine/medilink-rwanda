import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';

import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../data/session.dart';
import '../../ui/feedback.dart';

/// Book: service → day → time, then confirm in a bottom sheet (hold the slot, then book it).
class BookScreen extends ConsumerStatefulWidget {
  const BookScreen({super.key, required this.slug, this.serviceId});

  final String slug;
  final String? serviceId;

  @override
  ConsumerState<BookScreen> createState() => _BookScreenState();
}

class _BookScreenState extends ConsumerState<BookScreen> {
  String? _serviceId;
  int _day = 0;

  @override
  void initState() {
    super.initState();
    _serviceId = widget.serviceId;
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final facility = ref.watch(facilityProvider(widget.slug));
    return Scaffold(
      appBar: AppBar(title: Text(s.book)),
      body: facility.when(
        loading: () => const Padding(padding: EdgeInsets.all(Space.lg), child: SkeletonList(count: 3)),
        error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(facilityProvider(widget.slug))),
        data: (f) {
          final services = f.services.where((x) => x.bookable).toList();
          if (services.isEmpty) return EmptyState(icon: PhosphorIconsRegular.calendarX, text: s.noTimes);
          final service = services.where((x) => x.id == _serviceId).firstOrNull;
          return ListView(
            padding: const EdgeInsets.all(Space.lg),
            children: [
              Text(f.name, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: Space.xl),
              _Step(number: 1, title: s.chooseService),
              Wrap(
                spacing: Space.sm,
                runSpacing: Space.sm,
                children: [
                  for (final x in services)
                    ChoiceChip(
                      label: Text(s.pick(x.name)),
                      selected: x.id == _serviceId,
                      showCheckmark: false,
                      selectedColor: Palette.brandSubtle,
                      side: BorderSide(color: x.id == _serviceId ? Palette.brand : Palette.hairline),
                      onSelected: (_) {
                        HapticFeedback.selectionClick();
                        setState(() {
                          _serviceId = x.id;
                          _day = 0;
                        });
                      },
                    ),
                ],
              ),
              if (service != null) ...[
                const SizedBox(height: Space.xl),
                _Step(number: 2, title: s.chooseTime),
                _Slots(
                  slug: widget.slug,
                  service: service,
                  facility: f,
                  day: _day,
                  onDay: (i) => setState(() => _day = i),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.number, required this.title});
  final int number;
  final String title;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: Space.md),
        child: Row(
          children: [
            CircleAvatar(
              radius: 13,
              backgroundColor: Palette.brand,
              child: Text('$number', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
            ),
            const SizedBox(width: Space.sm),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
          ],
        ),
      );
}

class _Slots extends ConsumerWidget {
  const _Slots({
    required this.slug,
    required this.service,
    required this.facility,
    required this.day,
    required this.onDay,
  });

  final String slug;
  final FacilityService service;
  final Facility facility;
  final int day;
  final ValueChanged<int> onDay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final query = (slug: slug, serviceId: service.id);
    return ref.watch(slotsProvider(query)).when(
          loading: () => Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            children: [for (var i = 0; i < 8; i++) const Skeleton(width: 76, height: 40, radius: 10)],
          ),
          error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(slotsProvider(query))),
          data: (days) {
            if (days.isEmpty) return EmptyState(icon: PhosphorIconsRegular.calendarX, text: s.noTimes);
            final selected = days[day.clamp(0, days.length - 1)];
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  height: 64,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: days.length,
                    separatorBuilder: (_, _) => const SizedBox(width: Space.sm),
                    itemBuilder: (context, i) {
                      final d = days[i].date;
                      final on = i == day;
                      return InkWell(
                        borderRadius: BorderRadius.circular(Space.radius),
                        onTap: () => onDay(i),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 160),
                          width: 64,
                          decoration: BoxDecoration(
                            color: on ? Palette.brand : Palette.surface,
                            borderRadius: BorderRadius.circular(Space.radius),
                            border: Border.all(color: on ? Palette.brand : Palette.hairline),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                fmt.monthShort(d, s),
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: on ? Colors.white70 : Palette.muted),
                              ),
                              Text(
                                '${d.day}',
                                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: on ? Colors.white : Palette.ink),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: Space.lg),
                Wrap(
                  spacing: Space.sm,
                  runSpacing: Space.sm,
                  children: [
                    for (final slot in selected.slots)
                      ActionChip(
                        label: Text(fmt.time(slot.startsAt)),
                        backgroundColor: Palette.surface,
                        side: const BorderSide(color: Palette.hairline),
                        labelStyle: const TextStyle(fontWeight: FontWeight.w600),
                        onPressed: () => _confirm(context, ref, slot),
                      ),
                  ],
                ),
              ],
            );
          },
        );
  }

  Future<void> _confirm(BuildContext context, WidgetRef ref, Slot slot) async {
    HapticFeedback.selectionClick();
    final booked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ConfirmSheet(facility: facility, service: service, slot: slot),
    );
    if (booked != null && context.mounted) {
      ref
        ..invalidate(bookingsProvider('upcoming'))
        ..invalidate(slotsProvider((slug: slug, serviceId: service.id)));
      context.go('/visits/booking/$booked');
    }
  }
}

class _ConfirmSheet extends ConsumerStatefulWidget {
  const _ConfirmSheet({required this.facility, required this.service, required this.slot});

  final Facility facility;
  final FacilityService service;
  final Slot slot;

  @override
  ConsumerState<_ConfirmSheet> createState() => _ConfirmSheetState();
}

class _ConfirmSheetState extends ConsumerState<_ConfirmSheet> {
  String? _patientId;
  String? _error;

  Future<bool> _book() async {
    final s = S.of(context);
    final api = ref.read(apiProvider);
    final patientId = _patientId;
    if (patientId == null) return false;
    setState(() => _error = null);
    try {
      final hold = await api.post('/api/v1/patient/slots/${widget.slot.id}/hold/');
      final holdId = (hold! as Json)['hold_id'] as String;
      final booking = await api.post('/api/v1/patient/bookings/', {
        'hold_id': holdId,
        'patient_id': patientId,
        'symptoms': <Object>[],
      });
      final id = (booking! as Json)['id'] as String;
      Future<void>.delayed(const Duration(milliseconds: 650), () {
        if (mounted) Navigator.pop(context, id);
      });
      return true;
    } on ApiException catch (e) {
      setState(() => _error = e.kind == ApiFailure.conflict ? s.noTimes : (e.message.isNotEmpty ? e.message : s.somethingWrong));
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final profiles = ref.watch(meProvider).value?.profiles ?? const <Profile>[];
    _patientId ??= profiles.firstOrNull?.patientId;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Space.xl, 0, Space.xl, Space.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(fmt.day(widget.slot.startsAt, s), style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
            Text(
              fmt.time(widget.slot.startsAt),
              style: theme.textTheme.displayMedium?.copyWith(color: Palette.brand),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: Space.sm),
            Text(
              '${widget.facility.name} · ${s.pick(widget.service.name)}',
              style: theme.textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            if (widget.slot.doctor != null)
              Text(widget.slot.doctor!, style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
            if (profiles.length > 1) ...[
              const SizedBox(height: Space.xl),
              Text(s.bookFor, style: theme.textTheme.labelMedium),
              const SizedBox(height: Space.sm),
              Wrap(
                spacing: Space.sm,
                children: [
                  for (final p in profiles)
                    ChoiceChip(
                      label: Text(p.displayName),
                      selected: p.patientId == _patientId,
                      showCheckmark: false,
                      selectedColor: Palette.brandSubtle,
                      onSelected: (_) => setState(() => _patientId = p.patientId),
                    ),
                ],
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: Space.md),
              Text(_error!, style: const TextStyle(color: Palette.danger), textAlign: TextAlign.center),
            ],
            const SizedBox(height: Space.xl),
            LoadingButton(label: s.confirm, onPressed: _patientId == null ? null : _book),
          ],
        ),
      ),
    );
  }
}
