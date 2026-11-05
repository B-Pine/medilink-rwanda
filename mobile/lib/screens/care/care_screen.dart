import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';

import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/theme.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../ui/building.dart';
import '../../ui/feedback.dart';
import '../../ui/heartbeat_refresh.dart';
import '../../ui/page_header.dart';
import '../../app/strings_more.dart';
import '../../data/location.dart';
import 'facility_mini_card.dart';
import 'directions.dart';

class CareScreen extends ConsumerStatefulWidget {
  const CareScreen({super.key});

  @override
  ConsumerState<CareScreen> createState() => _CareScreenState();
}

class _CareScreenState extends ConsumerState<CareScreen> {
  SearchQuery _query = const SearchQuery();
  String _text = '';

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final here = ref.watch(locationProvider).point;
    // Sorted by distance once the phone's location is known (rounded to ~1 km).
    final query = _query.copyWith(lat: here?.latitude, lng: here?.longitude);
    final results = ref.watch(facilitySearchProvider(query));
    final needle = _text.trim().toLowerCase();
    List<FacilitySummary> filter(List<FacilitySummary> list) => needle.isEmpty
        ? list
        : list.where((f) => '${f.name} ${f.place}'.toLowerCase().contains(needle)).toList();

    return Scaffold(
      body: HeartbeatRefresh(
        onRefresh: () async {
          ref.invalidate(facilitySearchProvider(query));
          await ref.read(facilitySearchProvider(query).future).catchError((_) => <FacilitySummary>[]);
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: BandHeader(
                title: s.care,
                trailing: IconButton(
                  tooltip: s.t('map'),
                  onPressed: () => context.go('/care/map'),
                  icon: const Icon(PhosphorIconsRegular.mapTrifold, color: Colors.white),
                ),
                bottom: TextField(
                  onChanged: (v) => setState(() => _text = v),
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: s.search,
                    prefixIcon: const Icon(PhosphorIconsRegular.magnifyingGlass),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(Space.radius),
                      borderSide: BorderSide.none,
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(Space.radius),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
            ),
            // Filters stay pinned while the list scrolls.
            SliverPersistentHeader(
              pinned: true,
              delegate: _FilterHeader(
                child: _Filters(query: _query, onChanged: (q) => setState(() => _query = q)),
              ),
            ),
            ...results.when(
              loading: () => [
                const SliverPadding(
                  padding: EdgeInsets.all(Space.lg),
                  sliver: SliverToBoxAdapter(child: _FacilitySkeletons()),
                ),
              ],
              error: (e, _) => [
                SliverToBoxAdapter(
                  child: ErrorState(error: e, onRetry: () => ref.invalidate(facilitySearchProvider(query))),
                ),
              ],
              data: (list) {
                final shown = filter(list);
                if (shown.isEmpty) {
                  return [
                    SliverToBoxAdapter(
                      child: EmptyState(icon: PhosphorIconsRegular.magnifyingGlass, text: s.noResults),
                    ),
                  ];
                }
                return [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, Space.xxl),
                    sliver: SliverList.separated(
                      itemCount: shown.length,
                      separatorBuilder: (_, _) => const SizedBox(height: Space.lg),
                      itemBuilder: (context, i) => _Appear(index: i, child: FacilityCard(facility: shown[i])),
                    ),
                  ),
                ];
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _Filters extends StatelessWidget {
  const _Filters({required this.query, required this.onChanged});

  final SearchQuery query;
  final ValueChanged<SearchQuery> onChanged;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    Widget chip(String label, bool on, SearchQuery next, IconData icon) => Padding(
          padding: const EdgeInsets.only(right: Space.sm),
          child: FilterChip(
            selected: on,
            onSelected: (_) {
              HapticFeedback.selectionClick();
              onChanged(next);
            },
            avatar: Icon(icon, size: 16, color: on ? Palette.brand : Palette.muted),
            showCheckmark: false,
            label: Text(label),
            selectedColor: Palette.brandSubtle,
            backgroundColor: Palette.surface,
            side: BorderSide(color: on ? Palette.brand : Palette.hairline),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
          ),
        );
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.sm),
      child: Row(
        children: [
          chip(
            s.openNow,
            query.openNow,
            SearchQuery(openNow: !query.openNow, emergency: query.emergency, availableToday: query.availableToday),
            PhosphorIconsRegular.clock,
          ),
          chip(
            s.today,
            query.availableToday,
            SearchQuery(openNow: query.openNow, emergency: query.emergency, availableToday: !query.availableToday),
            PhosphorIconsRegular.calendarCheck,
          ),
          chip(
            s.emergency,
            query.emergency,
            SearchQuery(openNow: query.openNow, emergency: !query.emergency, availableToday: query.availableToday),
            PhosphorIconsRegular.firstAid,
          ),
        ],
      ),
    );
  }
}

class _FilterHeader extends SliverPersistentHeaderDelegate {
  _FilterHeader({required this.child});
  final Widget child;

  @override
  double get minExtent => 56;
  @override
  double get maxExtent => 56;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) =>
      ColoredBox(color: Palette.page, child: Align(alignment: Alignment.centerLeft, child: child));

  @override
  bool shouldRebuild(_FilterHeader oldDelegate) => oldDelegate.child != child;
}

/// List items fade and rise in, one after another.
class _Appear extends StatelessWidget {
  const _Appear({required this.index, required this.child});
  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: Duration(milliseconds: 260 + 50 * index.clamp(0, 6)),
        curve: Curves.easeOutCubic,
        builder: (context, t, child) => Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(0, 14 * (1 - t)), child: child),
        ),
        child: child,
      );
}

class _FacilitySkeletons extends StatelessWidget {
  const _FacilitySkeletons();

  @override
  Widget build(BuildContext context) => Column(
        children: [
          for (var i = 0; i < 3; i++) ...[
            const Card(
              clipBehavior: Clip.antiAlias,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AspectRatio(aspectRatio: 16 / 7, child: Skeleton(height: double.infinity, radius: 0)),
                  Padding(
                    padding: EdgeInsets.all(Space.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Skeleton(width: 180, height: 16),
                        SizedBox(height: Space.sm),
                        Skeleton(width: 120, height: 12),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: Space.lg),
          ],
        ],
      );
}

/// A facility as a card with a drawing of its kind of building (upgrade 14 §4), not a product.
class FacilityCard extends StatelessWidget {
  const FacilityCard({super.key, required this.facility});

  final FacilitySummary facility;

  Future<void> _menu(BuildContext context) async {
    final s = S.of(context);
    HapticFeedback.mediumImpact();
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.xl, 0, Space.xl, Space.sm),
              child: Text(facility.name, style: Theme.of(context).textTheme.titleMedium),
            ),
            ListTile(
              leading: const Icon(PhosphorIconsRegular.calendarPlus),
              title: Text(s.book),
              onTap: () => Navigator.pop(context, 'book'),
            ),
            ListTile(
              leading: const Icon(PhosphorIconsRegular.navigationArrow),
              title: Text(s.directions),
              onTap: () => Navigator.pop(context, 'directions'),
            ),
          ],
        ),
      ),
    );
    if (!context.mounted) return;
    if (choice == 'book') context.go('/care/${facility.slug}/book');
    if (choice == 'directions') openDirections(name: facility.name, place: facility.place);
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final wait = facility.waitRange == null ? null : fmt.waitRange(facility.waitRange!.min, facility.waitRange!.max, s);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.go('/care/${facility.slug}'),
        onLongPress: () => _menu(context),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                AspectRatio(
                  aspectRatio: 16 / 7,
                  child: Hero(
                    tag: 'building-${facility.slug}',
                    child: FacilityBuilding(type: facility.type, emergency: facility.emergency),
                  ),
                ),
                Positioned(
                  left: Space.md,
                  top: Space.md,
                  child: OpenBadge(open: facility.openNow),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(Space.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(facility.name, style: theme.textTheme.titleLarge),
                  const SizedBox(height: Space.xs),
                  Row(
                    children: [
                      const Icon(PhosphorIconsRegular.mapPin, size: 16, color: Palette.muted),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          [
                            facility.place,
                            if (facility.distanceKm != null) '${facility.distanceKm!.toStringAsFixed(1)} km',
                          ].where((t) => t.isNotEmpty).join(' · '),
                          style: theme.textTheme.bodySmall,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  if (facility.waiting != null || wait != null) ...[
                    const SizedBox(height: Space.md),
                    Row(
                      children: [
                        if (facility.waiting != null)
                          StatusPill(text: '${facility.waiting} ${s.waiting}', tone: PillTone.ochre),
                        if (wait != null) ...[
                          const SizedBox(width: Space.sm),
                          Text('~$wait', style: theme.textTheme.bodySmall?.copyWith(color: Palette.ochreText)),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
