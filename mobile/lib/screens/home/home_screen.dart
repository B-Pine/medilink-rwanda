import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/config.dart';
import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/location.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../ui/band.dart';
import '../../ui/controls.dart';
import '../../ui/facility_map.dart';
import '../../ui/feedback.dart';
import '../../ui/heartbeat_refresh.dart';
import '../../ui/icons.dart';
import '../../ui/logo.dart';
import '../care/facility_mini_card.dart';

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
      ..invalidate(meProvider)
      ..invalidate(facilitySearchProvider);
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

    const bandHeight = 214.0;
    final collapsed = _offset > bandHeight - 80;

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
                      right: Space.lg,
                      top: top + Space.lg,
                      child: Opacity(
                        opacity: (1 - _offset / 120).clamp(0, 1),
                        child: _Greeting(me: me.value, unread: unread),
                      ),
                    ),
                    Padding(
                      padding: EdgeInsets.fromLTRB(Space.lg, top + 118, Space.lg, 0),
                      child: _MainCard(visits: visits, upcoming: upcoming),
                    ),
                  ],
                ),
                if (offline) ...[const SizedBox(height: Space.md), const OfflineBar()],
                const SizedBox(height: Space.xl),
                const _QuickActions(),
                const SizedBox(height: Space.xxl),
                const _NearYou(),
                const SizedBox(height: Space.xl),
                const _MapPreview(),
                const SizedBox(height: Space.xl),
                const _EmergencyRow(),
                _UpcomingList(upcoming: upcoming, skipFirst: active.isEmpty),
                SizedBox(height: Space.xxl + MediaQuery.paddingOf(context).bottom),
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
                duration: Motion.of(context, Motion.fast),
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
              Text(
                '${s.greeting} · ${fmt.day(DateTime.now(), s, relative: false)}',
                style: theme.textTheme.bodySmall?.copyWith(color: Palette.onForestMuted),
              ),
              const SizedBox(height: 4),
              me == null
                  ? const Skeleton(width: 140, height: 26, onForest: true)
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
        Material(
          color: Palette.forestRaised,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: () => context.go('/home/notifications'),
            child: Padding(
              padding: const EdgeInsets.all(12), // 48 × 48
              child: Badge(
                isLabelVisible: unread > 0,
                label: Text(unread > 9 ? '9+' : '$unread'),
                backgroundColor: Palette.ochre,
                textColor: Palette.forest,
                child: Icon(PhosphorIconsRegular.bell, color: Colors.white, size: 24, semanticLabel: s.notifications),
              ),
            ),
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
                      ? Icon(PhosphorIconsFill.checkCircle, color: Palette.brand)
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
      // The pill stays small; the tap area is 48 tall.
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Align(
          alignment: Alignment.centerLeft,
          widthFactor: 1,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(color: Palette.forestRaised, borderRadius: BorderRadius.circular(Space.pill)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(PhosphorIconsRegular.usersThree, size: 16, color: Palette.onForestMuted),
                const SizedBox(width: 6),
                Text(
                  current?.displayName ?? S.of(context).family,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w600),
                ),
                Icon(PhosphorIconsRegular.caretDown, size: 14, color: Palette.onForestMuted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The one big card: today's ticket, else the next visit, else "where do you need care?".
class _MainCard extends StatelessWidget {
  const _MainCard({required this.visits, required this.upcoming});

  final AsyncValue<Cached<List<ActiveVisit>>> visits;
  final AsyncValue<Cached<List<Booking>>> upcoming;

  @override
  Widget build(BuildContext context) {
    final active = visits.value?.data;
    final next = upcoming.value?.data.firstOrNull;
    final Widget child;
    if (active == null && visits.isLoading) {
      child = const _CardSkeleton();
    } else if (active != null && active.isNotEmpty) {
      child = TicketCard(visit: active.first);
    } else if (next != null) {
      child = _NextVisitCard(booking: next);
    } else if (upcoming.isLoading) {
      child = const _CardSkeleton();
    } else {
      child = const _FindCareCard();
    }
    return AnimatedSwitcher(duration: Motion.of(context, Motion.normal), child: child);
  }
}

class _CardSkeleton extends StatelessWidget {
  const _CardSkeleton();

  @override
  Widget build(BuildContext context) => const SoftCard(
        raised: true,
        child: Padding(
          padding: EdgeInsets.all(Space.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Skeleton(width: 80, height: 12),
              SizedBox(height: Space.md),
              Skeleton(width: 150, height: 40, radius: 8),
              SizedBox(height: Space.xl),
              Skeleton(height: 14),
            ],
          ),
        ),
      );
}

/// The small caps label at the top of a card.
class _Eyebrow extends StatelessWidget {
  const _Eyebrow(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(letterSpacing: 1.3),
      );
}

/// The card's tinted footer strip.
class _Footer extends StatelessWidget {
  const _Footer({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        color: Palette.page,
        padding: const EdgeInsets.symmetric(horizontal: Space.xl, vertical: Space.md + 2),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: children),
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
      child: SoftCard(
        raised: true,
        onTap: onTap ?? () => context.go('/visits/ticket/${visit.id}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (called)
              Container(
                color: Palette.ochre,
                padding: const EdgeInsets.symmetric(horizontal: Space.xl, vertical: Space.sm + 2),
                child: Row(
                  children: [
                    Icon(PhosphorIconsFill.bellRinging, size: 18, color: Palette.forest),
                    const SizedBox(width: Space.sm),
                    Text(s.yourTurn, style: theme.textTheme.titleSmall?.copyWith(color: Palette.forest)),
                    const Spacer(),
                    if (visit.servicePoint != null)
                      Text(visit.servicePoint!, style: theme.textTheme.titleSmall?.copyWith(color: Palette.forest)),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.xl, Space.lg, Space.xl, Space.lg),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            _Eyebrow(s.ticket),
                            const SizedBox(width: Space.sm),
                            LiveDot(color: Palette.brand),
                            const SizedBox(width: 4),
                            Text(s.live, style: theme.textTheme.labelSmall?.copyWith(color: Palette.brand)),
                          ],
                        ),
                        const SizedBox(height: 2),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text(visit.ticket, style: theme.textTheme.displayMedium?.copyWith(color: Palette.forestInk)),
                        ),
                        Text(
                          s.pick(visit.service),
                          style: theme.textTheme.bodySmall,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  if (!called) _AheadRing(ahead: visit.ahead),
                ],
              ),
            ),
            _Footer(
              children: [
                Icon(PhosphorIconsRegular.mapPin, size: 18, color: Palette.brand),
                const SizedBox(width: 6),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        visit.facilityName,
                        style: theme.textTheme.titleSmall,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (wait != null && !called) ...[
                        const SizedBox(height: Space.xs),
                        _WaitChip(text: wait),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// People ahead, in a soft ring; the number rolls like a counter when it changes.
class _AheadRing extends StatelessWidget {
  const _AheadRing({required this.ahead});
  final int ahead;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    return Column(
      children: [
        Container(
          width: 68,
          height: 68,
          decoration: BoxDecoration(
            color: Palette.brandSubtle,
            shape: BoxShape.circle,
            border: Border.all(color: Palette.brand.withValues(alpha: 0.25), width: 2),
          ),
          alignment: Alignment.center,
          child: Rolling(
            value: ahead,
            child: Text('$ahead', style: theme.textTheme.headlineMedium?.copyWith(color: Palette.forestInk).tabular),
          ),
        ),
        const SizedBox(height: 4),
        Text(s.ahead, style: theme.textTheme.labelSmall),
      ],
    );
  }
}

class _WaitChip extends StatelessWidget {
  const _WaitChip({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) =>
      Rolling(value: text, child: StatusPill(text: text, tone: PillTone.ochre, icon: PhosphorIconsRegular.clock));
}

class _NextVisitCard extends StatelessWidget {
  const _NextVisitCard({required this.booking});

  final Booking booking;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final d = booking.startsAt;
    return SoftCard(
      raised: true,
      onTap: () => context.go('/visits/booking/${booking.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(Space.xl),
            child: Row(
              children: [
                Container(
                  width: 64,
                  height: 72,
                  decoration: BoxDecoration(color: Palette.forest, borderRadius: BorderRadius.circular(Space.radius)),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(fmt.monthShort(d, s), style: theme.textTheme.labelSmall?.copyWith(color: Palette.onForestAccent, letterSpacing: 1)),
                      Text('${d.day}', style: theme.textTheme.headlineMedium?.copyWith(color: Colors.white, height: 1.1).tabular),
                    ],
                  ),
                ),
                const SizedBox(width: Space.lg),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Eyebrow(s.nextVisit),
                      const SizedBox(height: 2),
                      Text(fmt.time(d), style: theme.textTheme.displayMedium?.copyWith(color: Palette.brand)),
                      Text(fmt.day(d, s), style: theme.textTheme.bodySmall),
                    ],
                  ),
                ),
              ],
            ),
          ),
          _Footer(
            children: [
              Icon(PhosphorIconsRegular.mapPin, size: 18, color: Palette.brand),
              const SizedBox(width: 6),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(booking.facilityName, style: theme.textTheme.titleSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                    Text(s.pick(booking.service), style: theme.textTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Nothing booked: a search-like prompt straight into Care.
class _FindCareCard extends StatelessWidget {
  const _FindCareCard();

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    return SoftCard(
      raised: true,
      child: Padding(
        padding: const EdgeInsets.all(Space.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Eyebrow(s.nothingToday),
            const SizedBox(height: Space.xs),
            Text(s.t('needCare'), style: theme.textTheme.headlineSmall),
            const SizedBox(height: Space.lg),
            Material(
              color: Palette.page,
              borderRadius: BorderRadius.circular(Space.radius),
              child: InkWell(
                borderRadius: BorderRadius.circular(Space.radius),
                onTap: () => context.go('/care'),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.md + 2),
                  child: Row(
                    children: [
                      Icon(PhosphorIconsRegular.magnifyingGlass, color: Palette.muted),
                      const SizedBox(width: Space.md),
                      Expanded(child: Text(s.t('searchFacility'), style: theme.textTheme.bodyLarge?.copyWith(color: Palette.muted))),
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(color: Palette.brand, borderRadius: BorderRadius.circular(8)),
                        child: Icon(PhosphorIconsRegular.arrowRight, color: Palette.onBrand, size: 16),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Four actions in one quiet row inside a single card: an icon and a one-line label each.
class _QuickActions extends StatelessWidget {
  const _QuickActions();

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final actions = [
      (s.book, PhosphorIconsRegular.calendarPlus, () => context.go('/care')),
      (s.t('mapShort'), PhosphorIconsRegular.mapTrifold, () => context.go('/home/map')),
      (s.symptoms, PhosphorIconsRegular.stethoscope, () => context.go('/home/symptoms')),
      (s.records, PhosphorIconsRegular.clipboardText, () => context.go('/me/records')),
    ];
    final cells = [
      for (final (label, icon, onTap) in actions)
        Expanded(
          child: Semantics(
            button: true,
            child: Pressable(
              borderRadius: BorderRadius.circular(Space.radius),
              onTap: onTap,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 72),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: Space.md),
                  child: Column(
                    children: [
                      Icon(icon, size: 26, color: Palette.brand),
                      const SizedBox(height: Space.sm),
                      // One line always; a long word shrinks a little rather than break.
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          label,
                          maxLines: 1,
                          softWrap: false,
                          style: Theme.of(context).textTheme.labelMedium?.copyWith(color: Palette.ink),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
    ];
    Widget row(List<Widget> children) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: children);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.lg),
      child: SoftCard(
        child: Padding(
          padding: const EdgeInsets.all(Space.xs),
          // One row of four; two rows of two when the text is large.
          child: context.largeText
              ? Column(children: [row(cells.sublist(0, 2)), row(cells.sublist(2))])
              : row(cells),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Padding(
        // Title and link line up with the cards' 16 px edges.
        padding: const EdgeInsets.fromLTRB(Space.lg, 0, Space.xs, Space.sm),
        child: Row(
          children: [
            Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge)),
            if (action != null)
              TextButton(
                onPressed: onAction,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [Text(action!), const SizedBox(width: 2), const Icon(PhosphorIconsRegular.caretRight, size: 16)],
                ),
              ),
          ],
        ),
      );
}

/// Facilities near the phone (or the busiest list when the location is unknown).
class _NearYou extends ConsumerStatefulWidget {
  const _NearYou();

  @override
  ConsumerState<_NearYou> createState() => _NearYouState();
}

class _NearYouState extends ConsumerState<_NearYou> {
  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final here = ref.watch(locationProvider);
    final results = ref.watch(facilitySearchProvider(ref.watch(nearbyQueryProvider)));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _SectionHeader(
          title: here.point == null ? s.t('facilities') : s.t('nearYou'),
          action: s.t('seeAll'),
          onAction: () => context.go('/care'),
        ),
        if (here.point == null) ...[
          const _LocationPrompt(),
          const SizedBox(height: Space.lg),
        ],
        SizedBox(
          height: 160 + context.scaled(112),
          child: results.when(
            loading: () => ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: Space.lg),
              children: const [
                SizedBox(width: 260, child: Skeleton(height: 272, radius: Space.radiusLg)),
                SizedBox(width: Space.md),
                SizedBox(width: 260, child: Skeleton(height: 272, radius: Space.radiusLg)),
              ],
            ),
            error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(facilitySearchProvider)),
            data: (list) => list.isEmpty
                ? EmptyState(icon: PhosphorIconsRegular.buildings, text: s.noResults)
                : LayoutBuilder(
                    builder: (context, box) {
                      // The next card peeks past the right edge; 16 px at both ends of the row.
                      final width = (box.maxWidth - 2 * Space.lg) * 0.82;
                      return ListView.separated(
                        scrollDirection: Axis.horizontal,
                        clipBehavior: Clip.none,
                        physics: const _SnapPhysics(),
                        padding: const EdgeInsets.fromLTRB(Space.lg, 2, Space.lg, Space.md),
                        itemCount: list.take(10).length,
                        separatorBuilder: (_, _) => const SizedBox(width: Space.md),
                        itemBuilder: (context, i) => SizedBox(width: width, child: FacilityMiniCard(facility: list[i])),
                      );
                    },
                  ),
          ),
        ),
      ],
    );
  }
}

/// Lets the carousel settle with a card's left edge at the 16 px gutter.
class _SnapPhysics extends ScrollPhysics {
  const _SnapPhysics({super.parent});

  @override
  _SnapPhysics applyTo(ScrollPhysics? ancestor) => _SnapPhysics(parent: buildParent(ancestor));

  @override
  Simulation? createBallisticSimulation(ScrollMetrics position, double velocity) {
    final extent = position.viewportDimension;
    // Card width + gap, as laid out in _NearYou.
    final step = (extent - 2 * Space.lg) * 0.82 + Space.md;
    final tolerance = toleranceFor(position);
    var page = position.pixels / step;
    if (velocity < -tolerance.velocity) {
      page = page.floorToDouble();
    } else if (velocity > tolerance.velocity) {
      page = page.ceilToDouble();
    } else {
      page = page.roundToDouble();
    }
    final target = (page * step).clamp(position.minScrollExtent, position.maxScrollExtent);
    if ((target - position.pixels).abs() < tolerance.distance) return super.createBallisticSimulation(position, velocity);
    return ScrollSpringSimulation(spring, position.pixels, target, velocity, tolerance: tolerance);
  }

  @override
  bool get allowImplicitScrolling => false;
}

class _LocationPrompt extends ConsumerWidget {
  const _LocationPrompt();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final here = ref.watch(locationProvider);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.lg),
      child: SoftCard(
        color: Palette.brandSubtle,
        radius: Space.radius,
        onTap: here.busy ? null : () => ref.read(locationProvider.notifier).request(),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.md),
          child: Row(
            children: [
              Icon(PhosphorIconsRegular.crosshair, color: Palette.brand),
              const SizedBox(width: Space.md),
              Expanded(
                child: Text(
                  here.blocked ? s.t('locationOff') : s.t('useLocation'),
                  style: theme.textTheme.titleSmall?.copyWith(color: Palette.forestInk),
                ),
              ),
              if (here.busy)
                DefaultTextStyle(style: TextStyle(color: Palette.brand), child: LoadingDots())
              else
                Icon(PhosphorIconsRegular.caretRight, size: 18, color: Palette.brand),
            ],
          ),
        ),
      ),
    );
  }
}

/// A still map of the facilities; tapping opens the full map.
class _MapPreview extends ConsumerWidget {
  const _MapPreview();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final here = ref.watch(locationProvider).point;
    final list = ref.watch(facilitySearchProvider(ref.watch(nearbyQueryProvider))).value ?? const <FacilitySummary>[];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.lg),
      child: SizedBox(
        height: 190,
        child: SoftCard(
          onTap: () => context.go('/home/map'),
          child: Stack(
            fit: StackFit.expand,
            children: [
              IgnorePointer(child: FacilityMap(facilities: list, here: here, interactive: false)),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(Space.lg, Space.xl, Space.lg, Space.md),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Palette.surface.withValues(alpha: 0), Palette.surface.withValues(alpha: 0.96)],
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(PhosphorIconsFill.mapTrifold, color: Palette.brand, size: 20),
                      const SizedBox(width: Space.sm),
                      Expanded(child: Text(s.t('map'), style: theme.textTheme.titleSmall)),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(color: Palette.brand, borderRadius: BorderRadius.circular(99)),
                        child: Text(s.t('openMap'), style: theme.textTheme.labelMedium?.copyWith(color: Palette.onBrand)),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmergencyRow extends StatelessWidget {
  const _EmergencyRow();

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.lg),
      child: SoftCard(
        radius: Space.radius,
        onTap: () => launchUrl(Uri.parse('tel:${AppConfig.emergencyNumber}')),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.md),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: Palette.dangerSubtle, shape: BoxShape.circle),
                child: Icon(PhosphorIconsFill.phoneCall, color: Palette.danger, size: 20),
              ),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.emergency, style: theme.textTheme.titleSmall),
                    Text('SAMU', style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(color: Palette.danger, borderRadius: BorderRadius.circular(99)),
                child: Text(
                  AppConfig.emergencyNumber,
                  style: theme.textTheme.titleSmall?.copyWith(color: Palette.onDanger, letterSpacing: 1),
                ),
              ),
            ],
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
      padding: const EdgeInsets.only(top: Space.xxl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SectionHeader(title: s.upcoming, action: s.visits, onAction: () => context.go('/visits')),
          for (final b in list)
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.lg, 0, Space.lg, Space.sm),
              child: BookingTile(booking: b),
            ),
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
    return SoftCard(
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
                borderRadius: BorderRadius.circular(Space.radius),
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
              Icon(PhosphorIconsRegular.caretRight, color: Palette.muted, size: 18),
          ],
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
          const BrandBadge(size: 30),
          const SizedBox(width: Space.sm),
          const Wordmark(height: 20),
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
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                            color: visit!.isCalled ? Palette.forest : Colors.white,
                            fontWeight: FontWeight.w700,
                          ).tabular,
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
