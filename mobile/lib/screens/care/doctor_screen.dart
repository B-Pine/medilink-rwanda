import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../ui/feedback.dart';
import '../../ui/icons.dart';

/// A doctor at one facility: who they are, the days they are here, what they do, and Book with
/// them. Initials only, never a photo (no faces published, upgrade 05 §3).
class DoctorScreen extends ConsumerStatefulWidget {
  const DoctorScreen({super.key, required this.slug, required this.doctorId});

  final String slug;
  final String doctorId;

  @override
  ConsumerState<DoctorScreen> createState() => _DoctorScreenState();
}

const _headerHeight = 276.0;

class _DoctorScreenState extends ConsumerState<DoctorScreen> {
  final _collapsed = ValueNotifier(false);

  String get slug => widget.slug;
  String get doctorId => widget.doctorId;

  @override
  void dispose() {
    _collapsed.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
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
          return NotificationListener<ScrollUpdateNotification>(
            onNotification: (n) {
              if (n.depth == 0) _collapsed.value = n.metrics.pixels > _headerHeight - kToolbarHeight - 40;
              return false;
            },
            child: CustomScrollView(
              slivers: [
                SliverAppBar(
                  pinned: true,
                  expandedHeight: _headerHeight,
                  backgroundColor: Palette.forest,
                  foregroundColor: Colors.white,
                  leading: const BackButton(color: Colors.white),
                  // the header shows the name; the bar shows it only once the header is gone
                  title: ValueListenableBuilder<bool>(
                    valueListenable: _collapsed,
                    builder: (_, collapsed, child) => AnimatedOpacity(
                      opacity: collapsed ? 1 : 0,
                      duration: const Duration(milliseconds: 150),
                      child: child,
                    ),
                    child: Text(doctor.name),
                  ),
                  flexibleSpace: FlexibleSpaceBar(
                    collapseMode: CollapseMode.parallax,
                    background: _Header(doctor: doctor),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(Space.lg, Space.xl, Space.lg, 120),
                  sliver: SliverList.list(
                    children: [
                      _FacilityRow(facility: f),
                      const SizedBox(height: Space.xl),
                      _Title(s.t('worksOn')),
                      SoftCard(
                        child: Padding(
                          padding: const EdgeInsets.all(Space.lg),
                          child: _Week(days: doctor.days),
                        ),
                      ),
                      if (services.isNotEmpty) ...[
                        const SizedBox(height: Space.xl),
                        _Title(s.services),
                        SoftCard(
                          child: Column(
                            children: [
                              for (final (i, service) in services.indexed) ...[
                                if (i > 0) const Divider(height: 1, indent: Space.lg, endIndent: Space.lg),
                                ListTile(
                                  contentPadding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: 2),
                                  leading: const Icon(PhosphorIconsRegular.stethoscope, color: Palette.brand),
                                  title: Text(s.pick(service.name), style: Theme.of(context).textTheme.titleSmall),
                                  trailing: service.bookable
                                      ? const Icon(PhosphorIconsRegular.caretRight, color: Palette.muted, size: 18)
                                      : null,
                                  onTap: service.bookable
                                      ? () => context.go('/care/$slug/book?service=${service.id}&doctor=$doctorId')
                                      : null,
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                      if (s.pick(doctor.bio).isNotEmpty) ...[
                        const SizedBox(height: Space.xl),
                        _Title(s.t('about')),
                        SoftCard(
                          child: Padding(
                            padding: const EdgeInsets.all(Space.lg),
                            child: Text(
                              s.pick(doctor.bio),
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.5),
                            ),
                          ),
                        ),
                      ],
                      if (doctor.languages.isNotEmpty) ...[
                        const SizedBox(height: Space.xl),
                        _Title(s.t('speaks')),
                        Wrap(
                          spacing: Space.sm,
                          runSpacing: Space.sm,
                          children: [
                            for (final code in doctor.languages)
                              Chip(
                                avatar: const Icon(PhosphorIconsRegular.translate, size: 16, color: Palette.brand),
                                label: Text(_languageName(code)),
                                backgroundColor: Palette.surface,
                                side: const BorderSide(color: Palette.hairline),
                              ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
      bottomNavigationBar: doctor == null || f == null || !f.services.any((x) => x.bookable)
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, Space.md),
                child: FilledButton.icon(
                  onPressed: () {
                    final bookable = f.services.where((x) => x.bookable && doctor.serviceIds.contains(x.id)).toList();
                    final service = bookable.length == 1 ? '&service=${bookable.single.id}' : '';
                    context.go('/care/$slug/book?doctor=$doctorId$service');
                  },
                  icon: const Icon(PhosphorIconsRegular.calendarPlus),
                  label: Text(s.t('bookWithDoctor')),
                ),
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

class _Header extends StatelessWidget {
  const _Header({required this.doctor});
  final Doctor doctor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = S.of(context);
    final today = DateTime.now().weekday - 1;
    final here = doctor.days.contains(today);
    return ColoredBox(
      color: Palette.forest,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.lg, kToolbarHeight, Space.lg, Space.xl),
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
                child: Text(
                  doctor.initials,
                  style: theme.textTheme.headlineSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(height: Space.md),
              Text(
                doctor.name,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.titleLarge?.copyWith(color: Colors.white),
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
                  borderRadius: BorderRadius.circular(999),
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
    );
  }
}

class _FacilityRow extends StatelessWidget {
  const _FacilityRow({required this.facility});
  final Facility facility;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SoftCard(
      onTap: () => context.pop(),
      child: Padding(
        padding: const EdgeInsets.all(Space.lg),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: Palette.brandSubtle, borderRadius: BorderRadius.circular(Space.radius)),
              child: const Icon(PhosphorIconsRegular.buildings, color: Palette.brand),
            ),
            const SizedBox(width: Space.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(facility.name, style: theme.textTheme.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (facility.place.isNotEmpty)
                    Text(
                      facility.place,
                      style: theme.textTheme.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
            const Icon(PhosphorIconsRegular.caretRight, color: Palette.muted, size: 18),
          ],
        ),
      ),
    );
  }
}

/// Seven day dots, Monday first: filled on their days, ringed for today.
class _Week extends StatelessWidget {
  const _Week({required this.days});
  final List<int> days;

  static const _en = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  static const _rw = ['Mbe', 'Kab', 'Gat', 'Kan', 'Gtn', 'Gtd', 'Cyu'];

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final labels = s.code == 'rw' ? _rw : _en;
    final today = DateTime.now().weekday - 1;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [for (var i = 0; i < 7; i++) _DayDot(label: labels[i], on: days.contains(i), today: i == today)],
    );
  }
}

class _DayDot extends StatelessWidget {
  const _DayDot({required this.label, required this.on, required this.today});
  final String label;
  final bool on, today;

  @override
  Widget build(BuildContext context) => Container(
    width: 38,
    height: 38,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: on ? Palette.brand : Palette.page,
      border: today ? Border.all(color: Palette.ochre, width: 2) : null,
    ),
    child: Text(
      label,
      style: TextStyle(
        fontSize: label.length > 1 ? 11 : 13,
        fontWeight: FontWeight.w700,
        color: on ? Colors.white : Palette.muted,
      ),
    ),
  );
}

class _Title extends StatelessWidget {
  const _Title(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: Space.xs, bottom: Space.md),
    child: Text(text, style: Theme.of(context).textTheme.titleMedium),
  );
}
