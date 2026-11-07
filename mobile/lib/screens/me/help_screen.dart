import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/models.dart';
import '../../data/session.dart';
import '../../ui/feedback.dart';
import '../../ui/icons.dart';

final _articlesProvider = FutureProvider.autoDispose.family<List<Json>, String>((ref, q) async {
  final data = await ref.read(apiProvider).get('/api/v1/public/help-articles/', query: {'q': q});
  return resultsOf(data).where((a) => a['audience'] != 'staff').toList();
});

final _articleProvider = FutureProvider.autoDispose.family<Json, String>((ref, slug) async {
  final data = await ref.read(apiProvider).get('/api/v1/public/help-articles/$slug/');
  return data! as Json;
});

final supportListProvider = FutureProvider.autoDispose<List<Json>>((ref) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/support-requests/');
  return resultsOf(data);
});

final _supportProvider = FutureProvider.autoDispose.family<Json, String>((ref, id) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/support-requests/$id/');
  return data! as Json;
});

String _i18n(Strings s, Object? map) => s.pick((map as Map?)?.cast<String, dynamic>());

/// Help articles with search, and the patient's support requests.
class HelpScreen extends ConsumerStatefulWidget {
  const HelpScreen({super.key});

  @override
  ConsumerState<HelpScreen> createState() => _HelpScreenState();
}

class _HelpScreenState extends ConsumerState<HelpScreen> {
  String _q = '';
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final articles = ref.watch(_articlesProvider(_q));
    return Scaffold(
      appBar: AppBar(title: Text(s.help)),
      body: ListView(
        padding: const EdgeInsets.all(Space.lg),
        children: [
          TextField(
            onChanged: (v) {
              _debounce?.cancel();
              _debounce = Timer(const Duration(milliseconds: 350), () => setState(() => _q = v.trim()));
            },
            decoration: InputDecoration(
              hintText: s.t('searchHelp'),
              prefixIcon: const Icon(PhosphorIconsRegular.magnifyingGlass),
            ),
          ),
          const SizedBox(height: Space.lg),
          Card(
            child: ListTile(
              leading: Icon(PhosphorIconsRegular.chatsCircle, color: Palette.brand),
              title: Text(s.t('contactSupport'), style: theme.textTheme.titleSmall),
              subtitle: Text(s.t('myRequests')),
              trailing: Icon(PhosphorIconsRegular.caretRight, size: 18, color: Palette.muted),
              onTap: () => context.go('/me/support'),
            ),
          ),
          const SizedBox(height: Space.xl),
          articles.when(
            loading: () => const SkeletonList(),
            error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(_articlesProvider(_q))),
            data: (list) => list.isEmpty
                ? EmptyState(icon: PhosphorIconsRegular.question, text: s.noResults)
                : Card(
                    child: Column(
                      children: [
                        for (final (i, a) in list.indexed) ...[
                          if (i > 0) const Divider(indent: Space.lg),
                          ListTile(
                            title: Text(_i18n(s, a['title_i18n']), style: theme.textTheme.titleSmall),
                            subtitle: Text(
                              _i18n(s, a['summary_i18n']),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            trailing: Icon(PhosphorIconsRegular.caretRight, size: 18, color: Palette.muted),
                            onTap: () => context.go('/me/help/${a['slug']}'),
                          ),
                        ],
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class ArticleScreen extends ConsumerWidget {
  const ArticleScreen({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final article = ref.watch(_articleProvider(slug));
    return Scaffold(
      appBar: AppBar(title: Text(s.help)),
      body: article.when(
        loading: () => const Padding(padding: EdgeInsets.all(Space.lg), child: SkeletonList(count: 2)),
        error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(_articleProvider(slug))),
        data: (a) => ListView(
          padding: const EdgeInsets.all(Space.xl),
          children: [
            Text(_i18n(s, a['title_i18n']), style: theme.textTheme.headlineSmall),
            const SizedBox(height: Space.md),
            Text(_i18n(s, a['summary_i18n']), style: theme.textTheme.bodyLarge?.copyWith(color: Palette.muted)),
            const SizedBox(height: Space.xl),
            // Article bodies are plain text with blank lines between paragraphs; markdown marks
            // (#, *, -) are shown as plain text.
            for (final para in _i18n(s, a['body_i18n']).split(RegExp(r'\n\s*\n')))
              Padding(
                padding: const EdgeInsets.only(bottom: Space.lg),
                child: Text(para.replaceAll(RegExp(r'^#+\s*', multiLine: true), '').trim(), style: theme.textTheme.bodyLarge),
              ),
            const SizedBox(height: Space.lg),
            OutlinedButton.icon(
              onPressed: () => context.go('/me/support/new'),
              icon: const Icon(PhosphorIconsRegular.chatsCircle),
              label: Text(s.t('contactSupport')),
            ),
          ],
        ),
      ),
    );
  }
}

PillTone _tone(String status) => switch (status) {
      'answered' => PillTone.ochre,
      'closed' => PillTone.muted,
      _ => PillTone.brand,
    };

class SupportListScreen extends ConsumerWidget {
  const SupportListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final list = ref.watch(supportListProvider);
    return Scaffold(
      appBar: AppBar(title: Text(s.t('myRequests'))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.go('/me/support/new'),
        icon: const Icon(PhosphorIconsRegular.plus),
        label: Text(s.t('newRequest')),
      ),
      body: list.when(
        loading: () => const Padding(padding: EdgeInsets.all(Space.lg), child: SkeletonList()),
        error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(supportListProvider)),
        data: (items) => items.isEmpty
            ? EmptyState(icon: PhosphorIconsRegular.chatsCircle, text: s.empty)
            : ListView(
                padding: const EdgeInsets.fromLTRB(Space.lg, Space.lg, Space.lg, 96),
                children: [
                  for (final r in items) ...[
                    Card(
                      child: ListTile(
                        title: Text('${r['subject']}', style: theme.textTheme.titleSmall),
                        subtitle: Text('${r['reference']} · ${s.t('topic.${r['topic']}')}'),
                        trailing: StatusPill(
                          text: s.t('support.${r['status'] ?? 'open'}'),
                          tone: _tone('${r['status']}'),
                        ),
                        onTap: () => context.go('/me/support/${r['id']}'),
                      ),
                    ),
                    const SizedBox(height: Space.sm),
                  ],
                ],
              ),
      ),
    );
  }
}

const _topics = ['booking_visits', 'account_access', 'family_profile', 'notifications', 'privacy', 'technical', 'other'];

class NewSupportScreen extends ConsumerStatefulWidget {
  const NewSupportScreen({super.key});

  @override
  ConsumerState<NewSupportScreen> createState() => _NewSupportScreenState();
}

class _NewSupportScreenState extends ConsumerState<NewSupportScreen> {
  final _subject = TextEditingController();
  final _body = TextEditingController();
  String _topic = 'booking_visits';
  String? _error;

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<bool> _send() async {
    setState(() => _error = null);
    try {
      final data = await ref.read(apiProvider).post('/api/v1/patient/support-requests/', {
        'topic': _topic,
        'subject': _subject.text.trim(),
        'body': _body.text.trim(),
        'client_path': 'app',
      }) as Json;
      ref.invalidate(supportListProvider);
      Future<void>.delayed(const Duration(milliseconds: 600), () {
        if (mounted) context.go('/me/support/${data['id']}');
      });
      return true;
    } on ApiException catch (e) {
      setState(() => _error = e.detail.isNotEmpty ? e.detail : S.of(context).somethingWrong);
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final ready = _subject.text.trim().isNotEmpty && _body.text.trim().isNotEmpty;
    return Scaffold(
      appBar: AppBar(title: Text(s.t('newRequest'))),
      body: ListView(
        padding: const EdgeInsets.all(Space.lg),
        children: [
          Text(s.t('topic'), style: Theme.of(context).textTheme.labelMedium),
          const SizedBox(height: Space.sm),
          Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            children: [
              for (final t in _topics)
                ChoiceChip(
                  label: Text(s.t('topic.$t')),
                  selected: t == _topic,
                  showCheckmark: false,
                  selectedColor: Palette.brandSubtle,
                  onSelected: (_) => setState(() => _topic = t),
                ),
            ],
          ),
          const SizedBox(height: Space.xl),
          TextField(
            controller: _subject,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(labelText: s.t('subject')),
          ),
          const SizedBox(height: Space.md),
          TextField(
            controller: _body,
            minLines: 5,
            maxLines: 10,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(labelText: s.t('message'), alignLabelWithHint: true),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: Space.md),
              child: Text(_error!, style: TextStyle(color: Palette.danger)),
            ),
          const SizedBox(height: Space.xl),
          LoadingButton(label: s.t('send'), onPressed: ready ? _send : null),
        ],
      ),
    );
  }
}

class SupportThreadScreen extends ConsumerStatefulWidget {
  const SupportThreadScreen({super.key, required this.requestId});

  final String requestId;

  @override
  ConsumerState<SupportThreadScreen> createState() => _SupportThreadScreenState();
}

class _SupportThreadScreenState extends ConsumerState<SupportThreadScreen> {
  final _reply = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _reply.text.trim();
    if (text.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiProvider).post('/api/v1/patient/support-requests/${widget.requestId}/messages/', {'body': text});
      _reply.clear();
      ref
        ..invalidate(_supportProvider(widget.requestId))
        ..invalidate(supportListProvider);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.detail.isNotEmpty ? e.detail : S.of(context).somethingWrong)),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final thread = ref.watch(_supportProvider(widget.requestId));
    final closed = thread.value?['status'] == 'closed';
    return Scaffold(
      appBar: AppBar(title: Text('${thread.value?['reference'] ?? ''}')),
      body: thread.when(
        loading: () => const Padding(padding: EdgeInsets.all(Space.lg), child: SkeletonList(count: 3)),
        error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(_supportProvider(widget.requestId))),
        data: (r) {
          final messages = resultsOf(r['messages']);
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(Space.lg),
                  children: [
                    Text('${r['subject']}', style: theme.textTheme.titleLarge),
                    const SizedBox(height: Space.xs),
                    Row(children: [
                      StatusPill(text: s.t('support.${r['status'] ?? 'open'}'), tone: _tone('${r['status']}')),
                      const SizedBox(width: Space.sm),
                      Text(s.t('topic.${r['topic']}'), style: theme.textTheme.bodySmall),
                    ]),
                    const SizedBox(height: Space.xl),
                    for (final m in messages) _Message(message: m),
                  ],
                ),
              ),
              if (!closed)
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.sm, Space.md),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _reply,
                            minLines: 1,
                            maxLines: 4,
                            decoration: InputDecoration(hintText: s.t('message')),
                          ),
                        ),
                        const SizedBox(width: Space.sm),
                        IconButton.filled(
                          onPressed: _busy ? null : _send,
                          icon: const Icon(PhosphorIconsFill.paperPlaneRight),
                          style: IconButton.styleFrom(fixedSize: const Size(52, 52)),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.message});

  final Json message;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final mine = message['author_kind'] == 'requester';
    final at = DateTime.tryParse('${message['created_at']}')?.toLocal();
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
        margin: const EdgeInsets.only(bottom: Space.md),
        padding: const EdgeInsets.all(Space.md),
        decoration: BoxDecoration(
          color: mine ? Palette.brandSubtle : Palette.surface,
          border: Border.all(color: mine ? Palette.brandSubtle : Palette.hairline),
          borderRadius: BorderRadius.circular(Space.radius),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(mine ? s.t('you') : '${message['author_name'] ?? s.t('support')}', style: theme.textTheme.labelSmall),
            const SizedBox(height: 2),
            Text('${message['body']}', style: theme.textTheme.bodyLarge),
            if (at != null) ...[
              const SizedBox(height: 4),
              Text('${fmt.dayShort(at, s)} · ${fmt.time(at)}', style: theme.textTheme.labelSmall),
            ],
          ],
        ),
      ),
    );
  }
}
