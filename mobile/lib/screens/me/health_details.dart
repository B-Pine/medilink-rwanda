import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/models.dart';
import '../../data/session.dart';
import '../../ui/feedback.dart';
import '../../ui/icons.dart';
import '../../ui/secure_screen.dart';
import '../../ui/sub_page.dart';

/// The detail pages behind Me → Records, Medications and Documents (web: /dashboard/records/:id,
/// /dashboard/medications/:id, /dashboard/documents), so the app shows what the website shows.

final recordProvider = FutureProvider.autoDispose.family<Json, String>((ref, id) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/records/$id/');
  return data! as Json;
});

final prescriptionProvider = FutureProvider.autoDispose.family<Json, String>((ref, id) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/prescriptions/$id/');
  return data! as Json;
});

DateTime? _at(Object? v) => DateTime.tryParse('${v ?? ''}')?.toLocal();
String _day(Object? v, Strings s) {
  final d = _at(v);
  return d == null ? '' : fmt.day(d, s, relative: false);
}

/// A labelled fact: small grey label over the value.
class Fact extends StatelessWidget {
  const Fact(this.label, this.value, {super.key, this.strong = false});

  final String label, value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: theme.textTheme.labelSmall?.copyWith(color: Palette.muted)),
        const SizedBox(height: 2),
        Text(
          value,
          style: (strong ? theme.textTheme.titleMedium : theme.textTheme.bodyLarge)?.tabular,
        ),
      ],
    );
  }
}

/// A white card with a hairline and the card shadow.
class InfoCard extends StatelessWidget {
  const InfoCard({super.key, required this.child, this.padding = const EdgeInsets.all(Space.lg)});

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: Space.lg),
        padding: padding,
        decoration: BoxDecoration(
          color: Palette.surface,
          border: Border.all(color: Palette.hairline),
          borderRadius: BorderRadius.circular(Space.radiusLg),
          boxShadow: Shadows.card,
        ),
        child: child,
      );
}

/// Facts in two columns.
class FactGrid extends StatelessWidget {
  const FactGrid(this.facts, {super.key});

  final List<Fact> facts;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, box) {
          final half = (box.maxWidth - Space.lg) / 2;
          return Wrap(
            spacing: Space.lg,
            runSpacing: Space.md,
            children: [for (final f in facts) SizedBox(width: context.largeText ? box.maxWidth : half, child: f)],
          );
        },
      );
}

/// "Report a problem" (S10b): opens the dispute form for this bill or prescription.
class ReportProblem extends StatelessWidget {
  const ReportProblem({super.key, required this.subjectType, required this.subjectId, required this.patientId});

  final String subjectType, subjectId, patientId;

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: () => context.push(
            Uri(
              path: '/me/disputes/new',
              queryParameters: {'subject_type': subjectType, 'subject_id': subjectId, 'patient_id': patientId},
            ).toString(),
          ),
          icon: Icon(PhosphorIconsRegular.scales, size: 18),
          label: Text(S.of(context).t('disputes.report')),
        ),
      );
}

/// /me/records/:id — a signed visit: diagnoses in plain words, what to do, vitals, addenda.
class RecordScreen extends ConsumerWidget {
  const RecordScreen({super.key, required this.recordId});

  final String recordId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final value = ref.watch(recordProvider(recordId));
    return SecureScreen(
      child: SubPage(
        title: s.records,
        onRefresh: () async => ref.invalidate(recordProvider(recordId)),
        children: [
          value.when(
            loading: () => const SkeletonList(count: 3),
            error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(recordProvider(recordId))),
            data: (r) {
              final diagnoses = resultsOf(r['diagnoses']);
              final vitals = r['vitals'] is Map ? (r['vitals'] as Map).cast<String, dynamic>() : null;
              final addenda = resultsOf(r['addenda']);
              String text(String key) => '${r[key] ?? ''}'.trim();
              final vitalFacts = <Fact>[
                if (vitals?['temperature_c'] != null) Fact(s.t('vital.temperature'), '${vitals!['temperature_c']} °C'),
                if (vitals?['systolic_mmhg'] != null)
                  Fact(s.t('vital.bp'), '${vitals!['systolic_mmhg']}/${vitals['diastolic_mmhg']} mmHg'),
                if (vitals?['pulse_bpm'] != null) Fact(s.t('vital.pulse'), '${vitals!['pulse_bpm']} /min'),
                if (vitals?['weight_kg'] != null) Fact(s.t('vital.weight'), '${vitals!['weight_kg']} kg'),
                if (vitals?['height_cm'] != null) Fact(s.t('vital.height'), '${vitals!['height_cm']} cm'),
              ];
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  InfoCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${r['facility_name'] ?? ''}', style: theme.textTheme.titleMedium),
                        const SizedBox(height: 2),
                        Text(
                          [_day(r['service_date'], s), '${r['doctor_name'] ?? ''}'].where((t) => t.isNotEmpty).join(' · '),
                          style: theme.textTheme.bodySmall,
                        ),
                        if (diagnoses.isNotEmpty) ...[
                          const SizedBox(height: Space.md),
                          for (final d in diagnoses)
                            Padding(
                              padding: const EdgeInsets.only(bottom: Space.xs),
                              child: Text(
                                '${(d['plain_language'] as String?)?.isNotEmpty == true ? d['plain_language'] : d['display'] ?? ''}',
                                style: theme.textTheme.titleSmall,
                              ),
                            ),
                        ],
                      ],
                    ),
                  ),
                  if (text('patient_instructions_text').isNotEmpty)
                    InfoCard(child: Fact(s.t('record.instructions'), text('patient_instructions_text'))),
                  if (text('plan_text').isNotEmpty) InfoCard(child: Fact(s.t('record.plan'), text('plan_text'))),
                  if (vitalFacts.isNotEmpty) InfoCard(child: FactGrid(vitalFacts)),
                  for (final a in addenda)
                    InfoCard(
                      child: Fact(
                        '${s.t('record.addendum')} · ${a['author_name'] ?? ''} · ${_day(a['signed_at'], s)}',
                        '${a['body'] ?? ''}',
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

/// /me/medications/:id — the code to show at the pharmacy, then each medicine in words.
class MedicationScreen extends ConsumerWidget {
  const MedicationScreen({super.key, required this.prescriptionId});

  final String prescriptionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final value = ref.watch(prescriptionProvider(prescriptionId));
    return SecureScreen(
      child: SubPage(
        title: s.medications,
        onRefresh: () async => ref.invalidate(prescriptionProvider(prescriptionId)),
        children: [
          value.when(
            loading: () => const SkeletonList(count: 3),
            error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(prescriptionProvider(prescriptionId))),
            data: (p) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                InfoCard(
                  padding: const EdgeInsets.symmetric(vertical: Space.xl, horizontal: Space.lg),
                  child: Column(
                    children: [
                      Text(s.t('rx.code'), style: theme.textTheme.labelMedium?.copyWith(color: Palette.muted)),
                      const SizedBox(height: Space.xs),
                      SelectableText('${p['number'] ?? ''}', style: theme.textTheme.headlineMedium?.tabular),
                      const SizedBox(height: Space.xs),
                      Text(
                        [
                          '${p['facility_name'] ?? ''}',
                          if (_at(p['expires_at']) != null) '${s.t('rx.until')} ${_day(p['expires_at'], s)}',
                        ].join(' · '),
                        style: theme.textTheme.bodySmall,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: Space.sm),
                      StatusPill(
                        text: s.state('${p['status']}'),
                        tone: p['status'] == 'ready_to_dispense' ? PillTone.ochre : PillTone.brand,
                      ),
                    ],
                  ),
                ),
                for (final item in resultsOf(p['items']).where((i) => i['status'] != 'draft'))
                  InfoCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${item['drug_display'] ?? ''}', style: theme.textTheme.titleMedium),
                        if ('${item['substitute_display'] ?? ''}'.isNotEmpty)
                          Text('${s.t('rx.givenAs')} ${item['substitute_display']}', style: theme.textTheme.bodySmall),
                        const SizedBox(height: Space.md),
                        FactGrid([
                          if ('${item['dose'] ?? ''}'.isNotEmpty) Fact(s.t('rx.dose'), '${item['dose']}'),
                          Fact(s.t('rx.often'), s.t('freq.${item['frequency_code']}')),
                          if (item['duration_days'] != null)
                            Fact(s.t('rx.long'), '${item['duration_days']} ${s.t('rx.days')}'),
                          Fact(s.t('rx.given'), '${item['dispensed_quantity'] ?? 0}/${item['quantity'] ?? 0}'),
                        ]),
                        if ('${item['instructions'] ?? ''}'.isNotEmpty) ...[
                          const SizedBox(height: Space.md),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(Space.md),
                            decoration: BoxDecoration(
                              color: Palette.brandSubtle,
                              borderRadius: BorderRadius.circular(Space.radiusSm),
                            ),
                            child: Text('${item['instructions']}', style: theme.textTheme.titleSmall),
                          ),
                        ],
                      ],
                    ),
                  ),
                ReportProblem(
                  subjectType: 'prescription',
                  subjectId: prescriptionId,
                  patientId: '${p['patient_id'] ?? ''}',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Opens a document: asks the API for a short-lived link and hands it to the phone's viewer.
Future<void> openDocument(BuildContext context, WidgetRef ref, String documentId) async {
  final s = S.of(context);
  final messenger = ScaffoldMessenger.of(context);
  try {
    final data = await ref.read(apiProvider).post('/api/v1/patient/documents/$documentId/download-link/', {}) as Json;
    final url = Uri.tryParse('${data['url'] ?? ''}');
    if (url == null || !await launchUrl(url, mode: LaunchMode.externalApplication)) {
      messenger.showSnackBar(SnackBar(content: Text(s.somethingWrong)));
    }
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.detail.isNotEmpty ? e.detail : s.somethingWrong)));
  }
}

