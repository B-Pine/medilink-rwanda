import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../ui/band.dart';
import '../../ui/controls.dart';
import '../../ui/feedback.dart';
import '../../ui/grouped.dart';
import '../../ui/icons.dart';

/// A doctor at one facility: who they are, the days they are here, what they do, and Book with
/// them. Initials only, never a photo (no faces published, upgrade 05 §3).
class DoctorScreen extends ConsumerWidget {
  const DoctorScreen({super.key, required this.slug, required this.doctorId});

  final String slug;
  final String doctorId;

  static const _headerHeight = 276.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final facility = ref.watch(facilityProvider(slug));
    final f = facility.value;
    final doctor = f?.doctors.where((d) => d.id == doctorId).firstOrNull;

    return Scaffold(
      backgroundColor: Palette.page,
      body: facility.when(
        loading: () => const SafeArea(
          child: Padding(padding: EdgeInsets.all(Space.lg), child: SkeletonList(count: 4)),
        ),
        error: (e, _) => SafeArea(
          child: ErrorState(error: e, onRetry: () => ref.invalidate(facilityProvider(slug))),
        ),
        data: (f) {
          if (doctor == null) {
            return SafeArea(
              child: Column(
                children: [
                  const Align(alignment: Alignment.centerLeft, child: BackButton()),
                  Expanded(
                    child: EmptyState(icon: PhosphorIconsRegular.stethoscope, text: s.t('doctorGone')),
                  ),
                ],
              ),
            );
          }
          final services = f.services.where((x) => doctor.serviceIds.contains(x.id)).toList();
          // Larger text needs a taller header (name, specialty and the pill grow with it).
          final grow = (MediaQuery.textScalerOf(context).scale(100) - 100).clamp(0, 200) * 2.0;
          return CustomScrollView(
            slivers: [
              SliverAppBar(
                pinned: true,
                expandedHeight: _headerHeight + grow,
                backgroundColor: Palette.forest,
                foregroundColor: Colors.white,
                systemOverlayStyle: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
                leading: const HeaderBackButton(),
                // the header shows the name; the bar shows it only once the header is gone
                title: CollapsedTitle(doctor.name),
                flexibleSpace: FlexibleSpaceBar(
                  collapseMode: CollapseMode.parallax,
                  background: _Header(doctor: doctor),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, Space.xxl),
                sliver: SliverList.list(
                  children: [
                    GroupedSection(
                      inset: Space.lg + Avatar.medium + Space.lg,
                      children: [
                        GroupedRow(
                          leading: Container(
                            width: Avatar.medium,
                            height: Avatar.medium,
                            decoration: BoxDecoration(color: Palette.brandSubtle, borderRadius: BorderRadius.circular(Space.radius)),
                            child: Icon(PhosphorIconsRegular.buildings, color: Palette.brand, size: 22),
                          ),
                          title: f.name,
                          subtitle: f.place,
                          onTap: () => context.pop(),
                        ),
                      ],
                    ),
                    GroupedSection(
                      label: s.t('worksOn'),
                      inset: Space.lg,
                      children: [
                        for (var i = 0; i < 7; i++) _DayRow(index: i, on: doctor.days.contains(i)),
                      ],
                    ),
                    if (services.isNotEmpty)
                      GroupedSection(
                        label: s.services,
                        children: [
                          for (final service in services)
                            GroupedRow(
                              icon: PhosphorIconsRegular.stethoscope,
                              title: s.pick(service.name),
                              onTap: service.bookable
                                  ? () => context.go('/care/$slug/book?service=${service.id}&doctor=$doctorId')
                                  : null,
                            ),
                        ],
                      ),
                    if (s.pick(doctor.bio).isNotEmpty)
                      GroupedSection(
                        label: s.t('about'),
                        children: [
                          Padding(
                            padding: const EdgeInsets.all(Space.lg),
                            child: Text(s.pick(doctor.bio), style: theme.textTheme.bodyMedium?.copyWith(height: 1.5)),
                          ),
                        ],
                      ),
                    if (doctor.languages.isNotEmpty) ...[
                      SectionLabel(s.t('speaks')),
                      Wrap(
                        spacing: Space.sm,
                        runSpacing: Space.sm,
                        children: [
                          for (final code in doctor.languages)
                            Chip(
                              avatar: Icon(PhosphorIconsRegular.translate, size: 16, color: Palette.brand),
                              label: Text(_languageName(code)),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          );
        },
      ),
      bottomNavigationBar: doctor == null || f == null || !f.services.any((x) => x.bookable)
          ? null
          : BottomActionBar(
              child: FilledButton.icon(
                onPressed: () {
                  HapticFeedback.selectionClick();
                  final bookable = f.services.where((x) => x.bookable && doctor.serviceIds.contains(x.id)).toList();
                  final service = bookable.length == 1 ? '&service=${bookable.single.id}' : '';
                  context.go('/care/$slug/book?doctor=$doctorId$service');
                },
                icon: const Icon(PhosphorIconsRegular.calendarPlus),
                label: Text(s.t('bookWithDoctor')),
              ),
            ),
    );
  }
}

String _languageName(String code) => switch (code.toLowerCase()) {
  'rw' => 'Ikinyarwanda',
  'en' => 'English',
  'fr' => 'Français',
  'sw' => 'Kiswahili',
  _ => code,
};

/// Forest, initials, name, specialty and whether they are here today; ends in the band's curve.
class _Header extends StatelessWidget {
  const _Header({required this.doctor});
  final Doctor doctor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = S.of(context);
    final today = DateTime.now().weekday - 1;
    final here = doctor.days.contains(today);
    return Stack(
      fit: StackFit.expand,
      children: [
        const ForestBand(height: double.infinity, curve: 0),
        SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Space.lg, kToolbarHeight, Space.lg, Space.curve + Space.md),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Container(
                  width: 84,
                  height: 84,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Palette.forestRaised,
                    border: Border.all(color: Palette.onForestAccent, width: 2),
                  ),
                  child: Text(doctor.initials, style: theme.textTheme.headlineMedium?.copyWith(color: Colors.white)),
                ),
                const SizedBox(height: Space.md),
                Text(
                  doctor.name,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.headlineMedium?.copyWith(color: Colors.white),
                ),
                if (doctor.specialty.isNotEmpty)
                  Text(
                    doctor.specialty,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(color: Palette.onForestMuted),
                  ),
                const SizedBox(height: Space.sm),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.xs),
                  decoration: BoxDecoration(
                    color: here ? Palette.onForestAccent : Palette.forestRaised,
                    borderRadius: BorderRadius.circular(Space.pill),
                  ),
                  child: Text(
                    here ? s.t('hereToday') : s.t('notHereToday'),
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: here ? Palette.forest : Palette.onForestMuted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const Positioned(left: 0, right: 0, bottom: -1, child: BandFoot()),
      ],
    );
  }
}

/// One weekday in full, with "Here" on the doctor's days and "Today" on today's.
class _DayRow extends StatelessWidget {
  const _DayRow({required this.index, required this.on});
  final int index;
  final bool on;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final today = index == DateTime.now().weekday - 1;
    return MergeSemantics(
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 44),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.sm),
          child: Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: Space.sm,
                  runSpacing: Space.xs,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      fmt.weekday(index, s),
                      style: (on ? theme.textTheme.titleSmall : theme.textTheme.bodyMedium)
                          ?.copyWith(color: on ? Palette.ink : Palette.muted),
                    ),
                    if (today) StatusPill(text: s.today, tone: PillTone.ochre),
                  ],
                ),
              ),
              if (on)
                StatusPill(text: s.t('onDuty'), tone: PillTone.brand, icon: PhosphorIconsBold.check)
              else
                Text('—', style: theme.textTheme.bodyMedium?.copyWith(color: Palette.muted)),
            ],
          ),
        ),
      ),
    );
  }
}
