import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/config.dart';
import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/theme.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../ui/band.dart';
import '../../ui/feedback.dart';
import '../../ui/heartbeat_refresh.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _scroll = ScrollController();
  double _offset = 0;
  Timer? _poll;
  final _called = <String>{};

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() => setState(() => _offset = _scroll.offset));
  }

  @override
  void dispose() {
    _poll?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  /// While a ticket is open, refresh it every 15 s (WebSockets for the app come in v2).
  void _keepPolling(bool active) {
    if (active && _poll == null) {
      _poll = Timer.periodic(AppConfig.trackerPoll, (_) => ref.invalidate(activeVisitsProvider));
    } else if (!active) {
      _poll?.cancel();
      _poll = null;
    }
  }

  /// A strong vibration once when the patient is called.
  void _announceCalls(List<ActiveVisit> visits) {
    for (final v in visits.where((v) => v.isCalled)) {
      if (_called.add(v.id)) {
        HapticFeedback.heavyImpact();
        Future<void>.delayed(const Duration(milliseconds: 250), HapticFeedback.heavyImpact);
      }
    }
  }

  Future<void> _refresh() async {
    ref
      ..invalidate(activeVisitsProvider)
      ..invalidate(bookingsProvider('upcoming'))
      ..invalidate(unreadProvider)
      ..invalidate(meProvider);
    await ref.read(activeVisitsProvider.future).catchError((_) => const Cached(<ActiveVisit>[]));
  }

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    final me = ref.watch(meProvider);
    final visits = ref.watch(activeVisitsProvider);
    final upcoming = ref.watch(bookingsProvider('upcoming'));
    final unread = ref.watch(unreadProvider).value ?? 0;

    final active = visits.value?.data ?? const <ActiveVisit>[];
    _keepPolling(active.isNotEmpty);
    _announceCalls(active);
    final offline = (visits.value?.offline ?? false) || (upcoming.value?.offline ?? false);

    const bandHeight = 200.0;
    final collapsed = _offset > bandHeight - 90;

    return Scaffold(
      body: Stack(
        children: [
          HeartbeatRefresh(
            onRefresh: _refresh,
            onForest: true,
            child: ListView(
              controller: _scroll,
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.zero,
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    ForestBand(height: bandHeight + top, parallax: _offset),
                    Positioned(
                      left: Space.xl,
                      right: Space.md,
                      top: top + Space.lg,
                      child: Opacity(
                        opacity: (1 - _offset / 120).clamp(0, 1),
                        child: _Greeting(me: me.value, unread: unread),
                      ),
                    ),
                    Padding(
                      padding: EdgeInsets.fromLTRB(Space.lg, top + 104, Space.lg, 0),
                      child: _MainCard(visits: visits, upcoming: upcoming),
                    ),
                  ],
                ),
                if (offline) const OfflineBar(),
                const SizedBox(height: Space.xl),
                const _QuickTiles(),
                const SizedBox(height: Space.xl),
                const _EmergencyRow(),
                const SizedBox(height: Space.xl),
                _UpcomingList(upcoming: upcoming, skipFirst: active.isEmpty),
                const SizedBox(height: Space.xxl),
              ],
            ),
          ),
          // The band collapses into a bar; an open ticket docks there as a small pill.
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            child: IgnorePointer(
              ignoring: !collapsed,
              child: AnimatedOpacity(
                opacity: collapsed ? 1 : 0,
                duration: const Duration(milliseconds: 160),
                child: _CollapsedBar(visit: active.isEmpty ? null : active.first),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Greeting extends ConsumerWidget {
  const _Greeting({required this.me, required this.unread});

  final Me? me;
  final int unread;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final profiles = me?.profiles ?? const <Profile>[];
    final selected = ref.watch(activePatientProvider);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(s.greeting, style: theme.textTheme.bodyMedium?.copyWith(color: Palette.onForestMuted)),
              const SizedBox(height: 2),
              me == null
                  ? const Skeleton(width: 140, height: 24, onForest: true)
                  : Text(
                      me!.firstName,
                      style: theme.textTheme.headlineMedium?.copyWith(color: Colors.white),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
              if (profiles.length > 1) ...[
                const SizedBox(height: Space.sm),
                _FamilySwitcher(profiles: profiles, selected: selected),
              ],
            ],
          ),
        ),
        IconButton(
          tooltip: s.notifications,
          onPressed: () => launchUrl(
            Uri.parse('${AppConfig.webBaseUrl}/dashboard/notifications'),
            mode: LaunchMode.externalApplication,
          ),
          icon: Badge(
            isLabelVisible: unread > 0,
            label: Text(unread > 9 ? '9+' : '$unread'),
            backgroundColor: Palette.ochre,
            textColor: Palette.forest,
            child: const Icon(PhosphorIconsRegular.bell, color: Colors.white, size: 26),
          ),
        ),
      ],
    );
  }
}

class _FamilySwitcher extends ConsumerWidget {
  const _FamilySwitcher({required this.profiles, required this.selected});

  final List<Profile> profiles;
  final String? selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = profiles.where((p) => p.patientId == selected).firstOrNull;
    return InkWell(
      borderRadius: BorderRadius.circular(99),
      onTap: () => showModalBottomSheet<void>(
        context: context,
        builder: (context) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final p in [null, ...profiles])
                ListTile(
                  leading: Icon(p == null ? PhosphorIconsRegular.usersThree : PhosphorIconsRegular.user),
                  title: Text(p?.displayName ?? S.of(context).family),
                  trailing: (p?.patientId == selected)
                      ? const Icon(PhosphorIconsFill.checkCircle, color: Palette.brand)
                      : null,
                  onTap: () {
                    ref.read(activePatientProvider.notifier).select(p?.patientId);
                    Navigator.pop(context);
                  },
                ),
            ],
          ),
        ),
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: Palette.forestRaised, borderRadius: BorderRadius.circular(99)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(PhosphorIconsRegular.usersThree, size: 16, color: Palette.onForestMuted),
            const SizedBox(width: 6),
            Text(
              current?.displayName ?? S.of(context).family,
              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const Icon(PhosphorIconsRegular.caretDown, size: 14, color: Palette.onForestMuted),
          ],
        ),
      ),
    );
  }
}

/// The one big card: today's ticket, else the next visit, else "Book".
class _MainCard extends StatelessWidget {
  const _MainCard({required this.visits, required this.upcoming});

  final AsyncValue<Cached<List<ActiveVisit>>> visits;
  final AsyncValue<Cached<List<Booking>>> upcoming;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final active = visits.value?.data;
    final next = upcoming.value?.data.firstOrNull;
    Widget child;
    if (active == null && visits.isLoading) {
      child = const _CardSkeleton();
    } else if (active != null && active.isNotEmpty) {
      child = TicketCard(visit: active.first);
    } else if (next != null) {
      child = _NextVisitCard(booking: next);
    } else if (upcoming.isLoading) {
      child = const _CardSkeleton();
    } else {
      child = Card(
        elevation: 6,
        shadowColor: Palette.forest.withValues(alpha: 0.18),
        child: Padding(
          padding: const EdgeInsets.all(Space.xl),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: Palette.brandSubtle, borderRadius: BorderRadius.circular(12)),
                child: const Icon(PhosphorIconsRegular.calendarPlus, color: Palette.brand),
              ),
              const SizedBox(width: Space.lg),
              Expanded(child: Text(s.nothingToday, style: Theme.of(context).textTheme.titleMedium)),
              FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: () => context.go('/care'),
                child: Text(s.book),
              ),
            ],
          ),
        ),
      );
    }
    return AnimatedSwitcher(duration: const Duration(milliseconds: 250), child: child);
  }
}

class _CardSkeleton extends StatelessWidget {
  const _CardSkeleton();

  @override
  Widget build(BuildContext context) => const Card(
        elevation: 6,
        child: Padding(
          padding: EdgeInsets.all(Space.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Skeleton(width: 80, height: 12),
              SizedBox(height: Space.md),
              Skeleton(width: 140, height: 36, radius: 8),
              SizedBox(height: Space.lg),
              Skeleton(width: 200, height: 14),
            ],
          ),
        ),
      );
}

/// Today's ticket: number, people ahead, wait. Ochre when it is the patient's turn.
class TicketCard extends StatelessWidget {
  const TicketCard({super.key, required this.visit, this.onTap});

  final ActiveVisit visit;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final called = visit.isCalled;
    final wait = fmt.waitRange(visit.estimate.min, visit.estimate.max, s);
    return Hero(
      tag: 'ticket-${visit.id}',
      child: Card(
        elevation: 6,
        shadowColor: Palette.forest.withValues(alpha: 0.18),
        color: called ? const Color(0xFFFFF7E0) : Palette.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Space.radius),
          side: BorderSide(color: called ? Palette.ochre : Palette.hairline, width: called ? 1.6 : 1),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(Space.radius),
          onTap: onTap ?? () => context.go('/visits/ticket/${visit.id}'),
          child: Padding(
            padding: const EdgeInsets.all(Space.xl),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(s.ticket.toUpperCase(), style: theme.textTheme.labelSmall?.copyWith(letterSpacing: 1.2)),
                    const Spacer(),
                    const LiveDot(color: Palette.brand),
                    const SizedBox(width: 6),
                    Text(s.live, style: theme.textTheme.labelSmall?.copyWith(color: Palette.brand)),
                  ],
                ),
                const SizedBox(height: Space.sm),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(visit.ticket, style: theme.textTheme.displayMedium),
                    const Spacer(),
                    if (called)
                      StatusPill(text: s.yourTurn, tone: PillTone.ochre)
                    else
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          _RollingNumber(value: visit.ahead, style: theme.textTheme.headlineMedium),
                          Text(s.ahead, style: theme.textTheme.bodySmall),
                        ],
                      ),
                  ],
                ),
                const SizedBox(height: Space.md),
                const Divider(),
                const SizedBox(height: Space.md),
                Row(
                  children: [
                    const Icon(PhosphorIconsRegular.mapPin, size: 18, color: Palette.muted),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        called && visit.servicePoint != null ? visit.servicePoint! : visit.facilityName,
                        style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (wait != null && !called) ...[
                      const Icon(PhosphorIconsRegular.clock, size: 18, color: Palette.ochreText),
                      const SizedBox(width: 4),
                      Text(wait, style: theme.textTheme.bodyMedium?.copyWith(color: Palette.ochreText)),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Numbers roll like a counter when they change.
class _RollingNumber extends StatelessWidget {
  const _RollingNumber({required this.value, this.style});

  final int value;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
        duration: const Duration(milliseconds: 350),
        transitionBuilder: (child, animation) => SlideTransition(
          position: Tween(begin: const Offset(0, 0.6), end: Offset.zero).animate(animation),
          child: FadeTransition(opacity: animation, child: child),
        ),
        child: Text('$value', key: ValueKey(value), style: style),
      );
}

class _NextVisitCard extends StatelessWidget {
  const _NextVisitCard({required this.booking});

  final Booking booking;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    return Card(
      elevation: 6,
      shadowColor: Palette.forest.withValues(alpha: 0.18),
      child: InkWell(
        borderRadius: BorderRadius.circular(Space.radius),
        onTap: () => context.go('/visits/booking/${booking.id}'),
        child: Padding(
          padding: const EdgeInsets.all(Space.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(s.nextVisit.toUpperCase(), style: theme.textTheme.labelSmall?.copyWith(letterSpacing: 1.2)),
              const SizedBox(height: Space.sm),
              Text(fmt.day(booking.startsAt, s), style: theme.textTheme.headlineSmall),
              Text(fmt.time(booking.startsAt), style: theme.textTheme.displayMedium?.copyWith(color: Palette.brand)),
              const SizedBox(height: Space.md),
              const Divider(),
              const SizedBox(height: Space.md),
              Row(
                children: [
                  const Icon(PhosphorIconsRegular.mapPin, size: 18, color: Palette.muted),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      booking.facilityName,
                      style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Flexible(
                    child: Text(
                      s.pick(booking.service),
                      style: theme.textTheme.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickTiles extends StatelessWidget {
  const _QuickTiles();

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final tiles = [
      (s.book, PhosphorIconsRegular.calendarPlus, () => context.go('/care')),
      (s.findCare, PhosphorIconsRegular.mapPin, () => context.go('/care')),
      (
        s.symptoms,
        PhosphorIconsRegular.stethoscope,
        () => launchUrl(Uri.parse('${AppConfig.webBaseUrl}/#symptoms'), mode: LaunchMode.externalApplication),
      ),
      (s.records, PhosphorIconsRegular.clipboardText, () => context.go('/me/records')),
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.lg),
      child: Row(
        children: [
          for (final (label, icon, onTap) in tiles)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: Space.xs),
                child: Material(
                  color: Palette.surface,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(Space.radius),
                    side: const BorderSide(color: Palette.hairline),
                  ),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(Space.radius),
                    onTap: onTap,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: Space.lg),
                      child: Column(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: const BoxDecoration(color: Palette.brandSubtle, shape: BoxShape.circle),
                            child: Icon(icon, size: 24, color: Palette.brand),
                          ),
                          const SizedBox(height: Space.sm),
                          Text(
                            label,
                            textAlign: TextAlign.center,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.labelMedium?.copyWith(color: Palette.ink),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _EmergencyRow extends StatelessWidget {
  const _EmergencyRow();

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.lg),
      child: Material(
        color: Palette.dangerSubtle,
        borderRadius: BorderRadius.circular(Space.radius),
        child: InkWell(
          borderRadius: BorderRadius.circular(Space.radius),
          onTap: () => launchUrl(Uri.parse('tel:${AppConfig.emergencyNumber}')),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.md),
            child: Row(
              children: [
                const Icon(PhosphorIconsFill.phoneCall, color: Palette.danger),
                const SizedBox(width: Space.md),
                Expanded(
                  child: Text(
                    s.emergency,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(color: Palette.danger),
                  ),
                ),
                Text(
                  AppConfig.emergencyNumber,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(color: Palette.danger),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _UpcomingList extends StatelessWidget {
  const _UpcomingList({required this.upcoming, required this.skipFirst});

  final AsyncValue<Cached<List<Booking>>> upcoming;
  final bool skipFirst;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final list = (upcoming.value?.data ?? const <Booking>[]).skip(skipFirst ? 1 : 0).take(3).toList();
    if (list.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: Space.xs, bottom: Space.md),
            child: Text(s.upcoming, style: Theme.of(context).textTheme.titleMedium),
          ),
          for (final b in list) ...[BookingTile(booking: b), const SizedBox(height: Space.sm)],
        ],
      ),
    );
  }
}

/// One appointment as a row: date block, facility, time.
class BookingTile extends StatelessWidget {
  const BookingTile({super.key, required this.booking});

  final Booking booking;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final cancelled = booking.status.contains('cancel') || booking.status == 'no_show';
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(Space.radius),
        onTap: () => context.go('/visits/booking/${booking.id}'),
        child: Padding(
          padding: const EdgeInsets.all(Space.md),
          child: Row(
            children: [
              Container(
                width: 52,
                padding: const EdgeInsets.symmetric(vertical: Space.sm),
                decoration: BoxDecoration(
                  color: cancelled ? Palette.page : Palette.brandSubtle,
                  borderRadius: BorderRadius.circular(Space.radiusSm),
                ),
                child: Column(
                  children: [
                    Text(
                      fmt.monthShort(booking.startsAt, s),
                      style: theme.textTheme.labelSmall?.copyWith(color: cancelled ? Palette.muted : Palette.brand),
                    ),
                    Text('${booking.startsAt.day}', style: theme.textTheme.titleLarge),
                  ],
                ),
              ),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(booking.facilityName, style: theme.textTheme.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text(
                      [fmt.time(booking.startsAt), s.pick(booking.service)].where((t) => t.isNotEmpty).join(' · '),
                      style: theme.textTheme.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              if (booking.status != 'confirmed')
                StatusPill(text: s.state(booking.status), tone: cancelled ? PillTone.muted : PillTone.brand)
              else
                const Icon(PhosphorIconsRegular.caretRight, color: Palette.muted, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

class _CollapsedBar extends StatelessWidget {
  const _CollapsedBar({required this.visit});

  final ActiveVisit? visit;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final top = MediaQuery.paddingOf(context).top;
    return Container(
      color: Palette.forest,
      padding: EdgeInsets.fromLTRB(Space.xl, top + Space.sm, Space.lg, Space.md),
      child: Row(
        children: [
          Text('MediLink', style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Colors.white)),
          const Spacer(),
          if (visit != null)
            InkWell(
              borderRadius: BorderRadius.circular(99),
              onTap: () => context.go('/visits/ticket/${visit!.id}'),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: visit!.isCalled ? Palette.ochre : Palette.forestRaised,
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (!visit!.isCalled) ...[const LiveDot(), const SizedBox(width: 6)],
                    Text(
                      visit!.isCalled ? '${visit!.ticket} · ${s.yourTurn}' : '${visit!.ticket} · ${visit!.ahead} ${s.ahead}',
                      style: TextStyle(
                        color: visit!.isCalled ? Palette.forest : Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
