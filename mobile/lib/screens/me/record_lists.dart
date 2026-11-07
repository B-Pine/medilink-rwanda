import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';

import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/theme.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../ui/feedback.dart';
import '../../ui/grouped.dart';
import '../../ui/secure_screen.dart';
import '../../ui/sub_page.dart';
import 'health_details.dart';

/// A secure list page: no screenshots, skeletons, empty and error states, pull to refresh.
class _SecureList<T> extends ConsumerWidget {
  const _SecureList({
    required this.title,
    required this.value,
    required this.onRefresh,
    required this.emptyIcon,
    required this.itemBuilder,
    this.offline = false,
  });

  final String title;
  final AsyncValue<List<T>> value;
  final VoidCallback onRefresh;
  final IconData emptyIcon;
  final Widget Function(BuildContext context, T item) itemBuilder;
  final bool offline;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    return SecureScreen(
      child: SubPage(
        title: title,
        onRefresh: () async => onRefresh(),
        children: [
          if (offline) ...[const OfflineBar(), const SizedBox(height: Space.lg)],
          value.when(
            loading: () => const SkeletonList(),
            error: (e, _) => ErrorState(error: e, onRetry: onRefresh),
            data: (items) => items.isEmpty
                ? EmptyState(icon: emptyIcon, text: s.empty)
                : GroupedSection(
                    inset: Space.lg + Avatar.medium + Space.lg,
                    children: [for (final item in items) itemBuilder(context, item)],
                  ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.title, required this.subtitle, this.trailing, this.onTap});

  final IconData icon;
  final String title, subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => GroupedRow(
        leading: Container(
          width: Avatar.medium,
          height: Avatar.medium,
          decoration: BoxDecoration(color: Palette.brandSubtle, borderRadius: BorderRadius.circular(Space.radius)),
          child: Icon(icon, color: Palette.brand, size: 22),
        ),
        title: title,
        subtitle: subtitle,
        trailing: trailing,
        onTap: onTap,
      );
}

String _when(DateTime? d, Strings s) => d == null ? '' : fmt.day(d, s, relative: false);

class RecordsScreen extends ConsumerWidget {
  const RecordsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    return _SecureList<ConsultationRecord>(
      title: s.records,
      value: ref.watch(recordsProvider),
      onRefresh: () => ref.invalidate(recordsProvider),
      emptyIcon: PhosphorIconsRegular.clipboardText,
      itemBuilder: (context, r) => _Row(
        icon: PhosphorIconsRegular.stethoscope,
        title: r.diagnoses.isEmpty ? r.facilityName : r.diagnoses.map((d) => d.text).join(', '),
        subtitle: [_when(r.date, s), r.facilityName, r.doctor].where((t) => t.isNotEmpty).join(' · '),
        onTap: () => context.go('/me/records/${r.id}'),
      ),
    );
  }
}

class MedicationsScreen extends ConsumerWidget {
  const MedicationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final value = ref.watch(prescriptionsProvider);
    return _SecureList<Prescription>(
      title: s.medications,
      value: value.whenData((c) => c.data),
      offline: value.value?.offline ?? false,
      onRefresh: () => ref.invalidate(prescriptionsProvider),
      emptyIcon: PhosphorIconsRegular.pill,
      itemBuilder: (context, p) => _Row(
        icon: PhosphorIconsRegular.pill,
        title: '${p.number} · ${p.itemCount}',
        subtitle: [_when(p.issuedAt, s), p.facilityName, p.prescriber].where((t) => t.isNotEmpty).join(' · '),
        trailing: StatusPill(
          text: s.state(p.status),
          tone: p.status == 'ready_to_dispense' ? PillTone.ochre : PillTone.brand,
        ),
        onTap: () => context.go('/me/medications/${p.id}'),
      ),
    );
  }
}

class DocumentsScreen extends ConsumerWidget {
  const DocumentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    return _SecureList<MedicalDocument>(
      title: s.documents,
      value: ref.watch(documentsProvider),
      onRefresh: () => ref.invalidate(documentsProvider),
      emptyIcon: PhosphorIconsRegular.fileText,
      itemBuilder: (context, d) => _Row(
        icon: PhosphorIconsRegular.fileText,
        title: d.number,
        subtitle: [_when(d.date, s), d.facilityName, d.author].where((t) => t.isNotEmpty).join(' · '),
        trailing: StatusPill(text: s.state(d.status), tone: PillTone.muted),
        onTap: () => openDocument(context, ref, d.id),
      ),
    );
  }
}

class ResultsScreen extends ConsumerWidget {
  const ResultsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    return _SecureList<LabResult>(
      title: s.results,
      value: ref.watch(resultsProvider),
      onRefresh: () => ref.invalidate(resultsProvider),
      emptyIcon: PhosphorIconsRegular.flask,
      itemBuilder: (context, r) => _Row(
        icon: PhosphorIconsRegular.flask,
        title: r.testName,
        subtitle: [_when(r.releasedAt, s), r.facilityName].where((t) => t.isNotEmpty).join(' · '),
        trailing: r.abnormal ? Icon(PhosphorIconsFill.warningCircle, color: Palette.ochre) : null,
      ),
    );
  }
}
