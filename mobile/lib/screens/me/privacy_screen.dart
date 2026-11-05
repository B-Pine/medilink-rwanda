import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../data/session.dart';
import '../../ui/feedback.dart';
import '../../ui/icons.dart';
import '../../ui/secure_screen.dart';

final _consentsProvider = FutureProvider.autoDispose<Json>((ref) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/consents/');
  return data! as Json;
});

final _accessProvider = FutureProvider.autoDispose.family<List<Json>, String>((ref, patientId) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/profiles/$patientId/access-history/');
  return resultsOf(data);
});

/// The privacy notice and terms, the website's text bundled in assets/legal/.
final legalProvider = FutureProvider.family<Json, String>((ref, lang) async {
  final raw = await rootBundle.loadString('assets/legal/$lang.json');
  return jsonDecode(raw) as Json;
});

/// Optional consents the patient can change here (terms, privacy and care stay as given).
const _kinds = ['research', 'notifications', 'location'];

class PrivacyScreen extends ConsumerWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final consents = ref.watch(_consentsProvider);
    final self = ref.watch(meProvider).value?.profiles.where((p) => p.relationship == 'self').firstOrNull;
    final legal = ref.watch(legalProvider(s.code)).value;
    return SecureScreen(
      child: Scaffold(
        appBar: AppBar(title: Text(s.privacy)),
        body: ListView(
          padding: const EdgeInsets.all(Space.lg),
          children: [
            _Title(s.t('yourChoices')),
            consents.when(
              loading: () => const SkeletonCard(),
              error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(_consentsProvider)),
              data: (data) {
                final given = <String, bool>{};
                for (final c in resultsOf(data['consents'])) {
                  if (c['patient_id'] == null) given[c['kind'] as String] = c['granted'] as bool? ?? false;
                }
                final versions = (data['current_versions'] as Map?)?.cast<String, dynamic>() ?? const {};
                return Card(
                  child: Column(
                    children: [
                      for (final (i, kind) in _kinds.indexed) ...[
                        if (i > 0) const Divider(indent: Space.lg),
                        _ConsentSwitch(kind: kind, on: given[kind] ?? false, version: '${versions[kind] ?? ''}'),
                      ],
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: Space.xl),
            _Title(s.t('accessHistory')),
            if (self == null)
              const SkeletonCard()
            else
              ref.watch(_accessProvider(self.patientId)).when(
                    loading: () => const SkeletonCard(),
                    error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(_accessProvider(self.patientId))),
                    data: (rows) => rows.isEmpty
                        ? Card(child: ListTile(title: Text(s.t('noAccess'))))
                        : Card(
                            child: Column(
                              children: [
                                for (final (i, r) in rows.take(20).indexed) ...[
                                  if (i > 0) const Divider(indent: 56),
                                  ListTile(
                                    leading: const Icon(PhosphorIconsRegular.eye, color: Palette.brand),
                                    title: Text(
                                      [
                                        (r['facility'] as Map?)?['name'] ?? '',
                                        r['actor_role'] ?? r['actor_kind'] ?? '',
                                      ].where((t) => '$t'.isNotEmpty).join(' · '),
                                      style: theme.textTheme.titleSmall,
                                    ),
                                    subtitle: Text(_when(r['occurred_at'], s)),
                                  ),
                                ],
                              ],
                            ),
                          ),
                  ),
            const SizedBox(height: Space.xl),
            _Title(s.t('documentsLegal')),
            Card(
              child: Column(
                children: [
                  for (final (i, doc) in const ['privacy', 'terms'].indexed) ...[
                    if (i > 0) const Divider(indent: 56),
                    ListTile(
                      leading: Icon(
                        doc == 'privacy' ? PhosphorIconsRegular.shieldCheck : PhosphorIconsRegular.fileText,
                        color: Palette.brand,
                      ),
                      title: Text((legal?[doc] as Map?)?['title'] as String? ?? doc),
                      trailing: const Icon(PhosphorIconsRegular.caretRight, size: 18, color: Palette.muted),
                      onTap: () => context.push('/legal/$doc'),
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

  static String _when(Object? iso, Strings s) {
    final d = DateTime.tryParse('${iso ?? ''}')?.toLocal();
    return d == null ? '' : '${fmt.day(d, s, relative: false)} · ${fmt.time(d)}';
  }
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

class _ConsentSwitch extends ConsumerStatefulWidget {
  const _ConsentSwitch({required this.kind, required this.on, required this.version});

  final String kind;
  final bool on;
  final String version;

  @override
  ConsumerState<_ConsentSwitch> createState() => _ConsentSwitchState();
}

class _ConsentSwitchState extends ConsumerState<_ConsentSwitch> {
  late bool _on = widget.on;
  bool _busy = false;

  Future<void> _set(bool on) async {
    setState(() {
      _on = on;
      _busy = true;
    });
    HapticFeedback.selectionClick();
    try {
      await ref
          .read(apiProvider)
          .post('/api/v1/patient/consents/', {'kind': widget.kind, 'version': widget.version, 'granted': on});
    } on ApiException {
      if (mounted) {
        setState(() => _on = !on);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(S.of(context).somethingWrong)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final icon = switch (widget.kind) {
      'research' => PhosphorIconsRegular.flask,
      'notifications' => PhosphorIconsRegular.bell,
      _ => PhosphorIconsRegular.mapPin,
    };
    return SwitchListTile(
      secondary: Icon(icon, color: Palette.brand),
      title: Text(s.t('consent.${widget.kind}')),
      value: _on,
      onChanged: _busy ? null : _set,
    );
  }
}

/// The privacy notice or terms of use: summary first, then each section.
class LegalScreen extends ConsumerWidget {
  const LegalScreen({super.key, required this.doc});

  final String doc;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final legal = ref.watch(legalProvider(s.code));
    return Scaffold(
      appBar: AppBar(title: Text((legal.value?[doc] as Map?)?['title'] as String? ?? '')),
      body: legal.when(
        loading: () => const Padding(padding: EdgeInsets.all(Space.lg), child: SkeletonList()),
        error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(legalProvider(s.code))),
        data: (all) {
          final d = (all[doc] as Map).cast<String, dynamic>();
          final sections = resultsOf(d['sections']);
          return ListView(
            padding: const EdgeInsets.all(Space.lg),
            children: [
              Card(
                color: Palette.brandSubtle,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Space.radius)),
                child: Padding(
                  padding: const EdgeInsets.all(Space.lg),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(all['summaryTitle'] as String? ?? '', style: theme.textTheme.titleSmall?.copyWith(color: Palette.forest)),
                      const SizedBox(height: Space.sm),
                      Text(d['summary'] as String? ?? '', style: theme.textTheme.bodyLarge),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: Space.xl),
              for (final (i, sec) in sections.indexed) ...[
                Text('${i + 1}. ${sec['title']}', style: theme.textTheme.titleMedium),
                const SizedBox(height: Space.sm),
                Text('${sec['body']}', style: theme.textTheme.bodyLarge),
                const SizedBox(height: Space.xl),
              ],
            ],
          );
        },
      ),
    );
  }
}
