import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';

import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../ui/building.dart';
import '../../ui/feedback.dart';
import '../../ui/insurers.dart';
import 'directions.dart';

/// A facility: its building, where it is, what it offers, and Book.
class FacilityScreen extends ConsumerWidget {
  const FacilityScreen({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final facility = ref.watch(facilityProvider(slug));
    final summary = ref
        .watch(facilitySearchProvider(const SearchQuery()))
        .value
        ?.where((f) => f.slug == slug)
        .firstOrNull;
    final f = facility.value;
    final type = f?.type ?? summary?.type ?? '';
    final emergency = f?.emergency ?? summary?.emergency ?? false;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            expandedHeight: 230,
            backgroundColor: Palette.forest,
            leading: const BackButton(color: Colors.white),
            title: Text(f?.name ?? summary?.name ?? ''),
            flexibleSpace: FlexibleSpaceBar(
              collapseMode: CollapseMode.parallax,
              background: Hero(
                tag: 'building-$slug',
                child: FacilityBuilding(type: type, emergency: emergency),
              ),
            ),
          ),
          ...facility.when(
            loading: () => [
              const SliverPadding(
                padding: EdgeInsets.all(Space.lg),
                sliver: SliverToBoxAdapter(child: SkeletonList(count: 3)),
              ),
            ],
            error: (e, _) => [
              SliverToBoxAdapter(child: ErrorState(error: e, onRetry: () => ref.invalidate(facilityProvider(slug)))),
            ],
            data: (f) => [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(Space.lg, Space.xl, Space.lg, 120),
                sliver: SliverList.list(
                  children: [
                    Row(
                      children: [
                        StatusPill(text: f.openNow ? s.openNow : s.closed, tone: f.openNow ? PillTone.brand : PillTone.muted),
                        if (f.emergency) ...[
                          const SizedBox(width: Space.sm),
                          StatusPill(text: s.emergency, tone: PillTone.danger),
                        ],
                      ],
                    ),
                    const SizedBox(height: Space.md),
                    Text(f.name, style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: Space.xs),
                    Text(f.address.isNotEmpty ? f.address : f.place, style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: Space.xl),
                    _Actions(facility: f),
                    const SizedBox(height: Space.xl),
                    _SectionTitle(s.t('insuranceAccepted')),
                    SoftCard(
                      child: Padding(
                        padding: const EdgeInsets.all(Space.lg),
                        child: InsurerPills(codes: f.insurers, wrap: true),
                      ),
                    ),
                    const SizedBox(height: Space.xl),
                    if (f.services.isNotEmpty) ...[
                      _SectionTitle(s.services),
                      Card(
                        child: Column(
                          children: [
                            for (final (i, service) in f.services.indexed) ...[
                              if (i > 0) const Divider(indent: Space.lg, endIndent: Space.lg),
                              _ServiceRow(slug: slug, service: service),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: Space.xl),
                    ],
                    if (f.doctors.isNotEmpty) ...[
                      _SectionTitle(s.doctors),
                      SizedBox(
                        height: 116,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: f.doctors.length,
                          separatorBuilder: (_, _) => const SizedBox(width: Space.md),
                          itemBuilder: (context, i) => _DoctorCard(
                            doctor: f.doctors[i],
                            onTap: () => context.go('/care/$slug/doctor/${f.doctors[i].id}'),
                          ),
                        ),
                      ),
                      const SizedBox(height: Space.xl),
                    ],
                    if (f.hours.isNotEmpty) ...[
                      _SectionTitle(s.hours),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(Space.lg),
                          child: Column(
                            children: [
                              for (final row in f.hours)
                                Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 3),
                                  child: Row(
                                    children: [
                                      Expanded(child: Text(row.isNotEmpty ? row.first : '')),
                                      Text(row.skip(1).join(' · '), style: Theme.of(context).textTheme.bodySmall),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      bottomNavigationBar: f == null || !f.services.any((x) => x.bookable)
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, Space.md),
                child: FilledButton.icon(
                  onPressed: () => context.go('/care/$slug/book'),
                  icon: const Icon(PhosphorIconsRegular.calendarPlus),
                  label: Text(s.book),
                ),
              ),
            ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: Space.xs, bottom: Space.md),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium),
      );
}

class _Actions extends StatelessWidget {
  const _Actions({required this.facility});
  final Facility facility;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final actions = [
      (
        s.directions,
        PhosphorIconsRegular.navigationArrow,
        () => openDirections(name: facility.name, place: facility.place, lat: facility.lat, lng: facility.lng),
      ),
      if (facility.phone.isNotEmpty) (s.call, PhosphorIconsRegular.phone, () => call(facility.phone)),
    ];
    return Row(
      children: [
        for (final (label, icon, onTap) in actions)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: Space.xs),
              child: OutlinedButton.icon(onPressed: onTap, icon: Icon(icon, size: 20), label: Text(label)),
            ),
          ),
      ],
    );
  }
}

class _ServiceRow extends StatelessWidget {
  const _ServiceRow({required this.slug, required this.service});
  final String slug;
  final FacilityService service;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final next = service.nextSlotAt;
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: 2),
      title: Text(s.pick(service.name), style: theme.textTheme.titleSmall),
      subtitle: next == null && service.waiting == null
          ? null
          : Text(
              [
                if (service.waiting != null) '${service.waiting} ${s.waiting}',
                if (next != null) '${fmt.day(next, s)} ${fmt.time(next)}',
              ].join(' · '),
              style: theme.textTheme.bodySmall,
            ),
      trailing: service.bookable
          ? const Icon(PhosphorIconsRegular.caretRight, color: Palette.muted, size: 18)
          : null,
      onTap: service.bookable ? () => context.go('/care/$slug/book?service=${service.id}') : null,
    );
  }
}

class _DoctorCard extends StatelessWidget {
  const _DoctorCard({required this.doctor, required this.onTap});
  final Doctor doctor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final initials = doctor.initials;
    return SizedBox(
      width: 150,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
          padding: const EdgeInsets.all(Space.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: Palette.brandSubtle,
                child: Text(initials, style: theme.textTheme.titleSmall?.copyWith(color: Palette.brand)),
              ),
              const Spacer(),
              Text(doctor.name, style: theme.textTheme.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(doctor.specialty, style: theme.textTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
          ),
          ),
        ),
      ),
    );
  }
}
