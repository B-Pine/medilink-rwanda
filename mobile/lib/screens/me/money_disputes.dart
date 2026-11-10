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
import '../../ui/grouped.dart';
import '../../ui/icons.dart';
import '../../ui/secure_screen.dart';
import '../../ui/sub_page.dart';
import 'health_details.dart';

/// Bills (S8-F6) and disputes (S10b-F1) as on the website's dashboard (/dashboard/bills,
/// /dashboard/disputes): what is left to pay, each bill's shares and receipts, and a complaint
/// raised from the bill or prescription it is about, with its thread and answers.

final billsProvider = FutureProvider.autoDispose<List<Json>>((ref) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/bills/');
  final rows = resultsOf(data)
    ..sort((a, b) {
      final due = ((b['balance_rwf'] as int? ?? 0) > 0 ? 1 : 0) - ((a['balance_rwf'] as int? ?? 0) > 0 ? 1 : 0);
      return due != 0 ? due : '${b['service_date']}'.compareTo('${a['service_date']}');
    });
  return rows;
});

final billProvider = FutureProvider.autoDispose.family<Json, String>((ref, id) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/bills/$id/');
  return data! as Json;
});

final disputesProvider = FutureProvider.autoDispose<List<Json>>((ref) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/disputes/');
  return resultsOf(data);
});

final disputeProvider = FutureProvider.autoDispose.family<Json, String>((ref, id) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/disputes/$id/');
  return data! as Json;
});

/// "1,200 RWF" (French: "1 200 RWF").
String rwf(Object? amount, Strings s) {
  final n = (amount as num? ?? 0).round();
  final digits = n.abs().toString();
  final sep = s.code == 'fr' ? ' ' : ',';
  final out = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write(sep);
    out.write(digits[i]);
  }
  return '$out RWF';
}

String _day(Object? v, Strings s) {
  final d = DateTime.tryParse('${v ?? ''}')?.toLocal();
  return d == null ? '' : fmt.day(d, s, relative: false);
}

PillTone _billTone(String status) => switch (status) {
      'paid' => PillTone.brand,
      'open' || 'partly_paid' => PillTone.ochre,
      _ => PillTone.muted,
    };

// ---- bills ---------------------------------------------------------------------------------

class BillsScreen extends ConsumerWidget {
  const BillsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final value = ref.watch(billsProvider);
    return SecureScreen(
      child: SubPage(
        title: s.t('bills'),
        onRefresh: () async => ref.invalidate(billsProvider),
        children: [
          value.when(
            loading: () => const SkeletonList(),
            error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(billsProvider)),
            data: (rows) {
              if (rows.isEmpty) return EmptyState(icon: PhosphorIconsRegular.receipt, text: s.t('bills.empty'));
              final due = rows.fold<int>(0, (sum, r) => sum + (r['balance_rwf'] as int? ?? 0));
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  InfoCard(
                    child: Fact(s.t('bills.toPay'), rwf(due, s), strong: true),
                  ),
                  GroupedSection(
                    children: [
                      for (final r in rows)
                        GroupedRow(
                          icon: PhosphorIconsRegular.receipt,
                          title: '${r['facility_name'] ?? ''}',
                          subtitle: [
                            _day(r['service_date'], s),
                            if ((r['balance_rwf'] as int? ?? 0) > 0)
                              '${rwf(r['balance_rwf'], s)} ${s.t('bills.left')}',
                          ].where((t) => t.isNotEmpty).join(' · '),
                          trailing: StatusPill(
                            text: s.t('bill.${r['status']}'),
                            tone: _billTone('${r['status']}'),
                          ),
                          onTap: () => context.go('/me/bills/${r['id']}'),
                        ),
                    ],
                  ),
                  Text(s.t('bills.payAtDesk'), style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class BillScreen extends ConsumerWidget {
  const BillScreen({super.key, required this.billId});

  final String billId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final value = ref.watch(billProvider(billId));
    return SecureScreen(
      child: SubPage(
        title: s.t('bills'),
        onRefresh: () async => ref.invalidate(billProvider(billId)),
        children: [
          value.when(
            loading: () => const SkeletonList(count: 3),
            error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(billProvider(billId))),
            data: (b) {
              final balance = b['balance_rwf'] as int? ?? 0;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  InfoCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(child: Text('${b['facility_name'] ?? ''}', style: theme.textTheme.titleMedium)),
                            StatusPill(text: s.t('bill.${b['status']}'), tone: _billTone('${b['status']}')),
                          ],
                        ),
                        Text(_day(b['service_date'], s), style: theme.textTheme.bodySmall),
                        const SizedBox(height: Space.lg),
                        FactGrid([
                          Fact(s.t('bill.total'), rwf(b['total_rwf'], s)),
                          Fact(s.t('bill.insurer'), rwf(b['insurer_share_rwf'], s)),
                          Fact(s.t('bill.share'), rwf(b['patient_share_rwf'], s)),
                          Fact(s.t('bill.paid'), rwf(b['paid_rwf'], s)),
                          Fact(s.t('bill.balance'), rwf(balance, s), strong: true),
                        ]),
                      ],
                    ),
                  ),
                  GroupedSection(
                    label: s.t('bill.items'),
                    children: [
                      for (final l in resultsOf(b['lines']))
                        GroupedRow(
                          title: (l['quantity'] as int? ?? 1) > 1 ? '${l['name']} × ${l['quantity']}' : '${l['name']}',
                          subtitle:
                              '${s.t('bill.insurer')} ${rwf(l['insurer_share_rwf'], s)} · ${s.t('bill.share')} ${rwf(l['patient_share_rwf'], s)}',
                          trailing: Text(rwf(l['total_rwf'], s), style: theme.textTheme.bodyMedium?.tabular),
                          chevron: false,
                        ),
                    ],
                  ),
                  if (resultsOf(b['payments']).isNotEmpty)
                    GroupedSection(
                      label: s.t('bill.payments'),
                      children: [
                        for (final p in resultsOf(b['payments']))
                          GroupedRow(
                            title: '${rwf(p['amount_rwf'], s)} · ${s.t('pay.${p['method']}')}',
                            subtitle: [
                              _day(p['received_at'], s),
                              if (p['receipt_number'] != null) '${s.t('bill.receipt')} ${p['receipt_number']}',
                              if (p['status'] == 'voided') s.t('bill.voided'),
                            ].join(' · '),
                            chevron: false,
                          ),
                      ],
                    ),
                  ReportProblem(subjectType: 'bill', subjectId: billId, patientId: '${b['patient_id'] ?? ''}'),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

// ---- disputes ------------------------------------------------------------------------------

PillTone _disputeTone(String status) => switch (status) {
      'info_requested' || 'resolved' || 'final_decision' => PillTone.ochre,
      'closed' => PillTone.muted,
      _ => PillTone.brand,
    };

String _subject(Json d, Strings s) {
  final snap = d['subject_snapshot'] is Map ? (d['subject_snapshot'] as Map) : const {};
  final ref = snap['number'] ?? snap['booking_code'] ?? snap['ticket_number'];
  return [s.t('subject.${d['subject_type']}'), if (ref != null) '$ref'].join(' ');
}

class DisputesScreen extends ConsumerWidget {
  const DisputesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final value = ref.watch(disputesProvider);
    return SecureScreen(
      child: SubPage(
        title: s.t('disputes'),
        onRefresh: () async => ref.invalidate(disputesProvider),
        children: [
          value.when(
            loading: () => const SkeletonList(),
            error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(disputesProvider)),
            data: (rows) => rows.isEmpty
                ? EmptyState(icon: PhosphorIconsRegular.scales, text: s.t('disputes.empty'))
                : GroupedSection(
                    footer: s.t('disputes.how'),
                    children: [
                      for (final d in rows)
                        GroupedRow(
                          icon: PhosphorIconsRegular.scales,
                          title: _subject(d, s),
                          subtitle: [_day(d['created_at'], s), '${d['facility_name'] ?? ''}'].join(' · '),
                          trailing: StatusPill(
                            text: s.t('dispute.${d['status']}'),
                            tone: _disputeTone('${d['status']}'),
                          ),
                          onTap: () => context.go('/me/disputes/${d['id']}'),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class NewDisputeScreen extends ConsumerStatefulWidget {
  const NewDisputeScreen({super.key, required this.subjectType, required this.subjectId, required this.patientId});

  final String subjectType, subjectId, patientId;

  @override
  ConsumerState<NewDisputeScreen> createState() => _NewDisputeScreenState();
}

class _NewDisputeScreenState extends ConsumerState<NewDisputeScreen> {
  final _text = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<bool> _send() async {
    setState(() => _error = null);
    try {
      final data = await ref.read(apiProvider).post('/api/v1/patient/disputes/', {
        'patient_id': widget.patientId,
        'subject_type': widget.subjectType,
        'subject_id': widget.subjectId,
        'description': _text.text.trim(),
      }) as Json;
      ref.invalidate(disputesProvider);
      Future<void>.delayed(const Duration(milliseconds: 600), () {
        if (mounted) context.go('/me/disputes/${data['id']}');
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
    final ready = _text.text.trim().length >= 10;
    return Scaffold(
      appBar: AppBar(title: Text(s.t('disputes.report'))),
      body: ListView(
        padding: const EdgeInsets.all(Space.lg),
        children: [
          Text(s.t('subject.${widget.subjectType}'), style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: Space.lg),
          TextField(
            controller: _text,
            minLines: 5,
            maxLines: 10,
            maxLength: 3000,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: s.t('disputes.what'),
              helperText: s.t('disputes.min'),
              alignLabelWithHint: true,
            ),
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

class DisputeScreen extends ConsumerStatefulWidget {
  const DisputeScreen({super.key, required this.disputeId});

  final String disputeId;

  @override
  ConsumerState<DisputeScreen> createState() => _DisputeScreenState();
}

class _DisputeScreenState extends ConsumerState<DisputeScreen> {
  final _reply = TextEditingController();
  final _statement = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _reply.dispose();
    _statement.dispose();
    super.dispose();
  }

  String get _base => '/api/v1/patient/disputes/${widget.disputeId}';

  Future<bool> _post(String step, Map<String, Object?> body, String done) async {
    final messenger = ScaffoldMessenger.of(context);
    final s = S.of(context);
    try {
      await ref.read(apiProvider).post('$_base/$step/', body);
      ref
        ..invalidate(disputeProvider(widget.disputeId))
        ..invalidate(disputesProvider);
      messenger.showSnackBar(SnackBar(content: Text(s.t(done))));
      return true;
    } on ApiException catch (e) {
      if (e.kind == ApiFailure.conflict) ref.invalidate(disputeProvider(widget.disputeId));
      messenger.showSnackBar(SnackBar(content: Text(e.detail.isNotEmpty ? e.detail : s.somethingWrong)));
      return false;
    }
  }

  Future<void> _send() async {
    final text = _reply.text.trim();
    if (text.length < 2 || _busy) return;
    setState(() => _busy = true);
    if (await _post('messages', {'body': text}, 'dispute.sent')) _reply.clear();
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final value = ref.watch(disputeProvider(widget.disputeId));
    final d = value.value;
    final open = d != null && d['status'] != 'closed';
    return SecureScreen(
      child: Scaffold(
        appBar: AppBar(title: Text(d == null ? s.t('disputes') : _subject(d, s))),
        body: value.when(
          loading: () => const Padding(padding: EdgeInsets.all(Space.lg), child: SkeletonList(count: 3)),
          error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(disputeProvider(widget.disputeId))),
          data: (d) {
            final version = d['version'] as int? ?? 0;
            final status = '${d['status']}';
            final deadline = status == 'open' || status == 'reopened'
                ? (s.t('dispute.answerBy'), d['acknowledge_by'])
                : (status == 'acknowledged' || status == 'under_review' || status == 'info_requested') &&
                        d['decide_by'] != null
                    ? (s.t('dispute.decisionBy'), d['decide_by'])
                    : null;
            final messages = resultsOf(d['messages']);
            return Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.all(Space.lg),
                    children: [
                      InfoCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(child: Text('${d['facility_name'] ?? ''}', style: theme.textTheme.titleMedium)),
                                StatusPill(text: s.t('dispute.$status'), tone: _disputeTone(status)),
                              ],
                            ),
                            const SizedBox(height: Space.md),
                            FactGrid([
                              Fact(s.t('dispute.sentOn'), _day(d['created_at'], s)),
                              if (deadline != null) Fact(deadline.$1, _day(deadline.$2, s)),
                            ]),
                            const SizedBox(height: Space.md),
                            Fact(s.t('dispute.youWrote'), '${d['description'] ?? ''}'),
                          ],
                        ),
                      ),
                      if ('${d['outcome'] ?? ''}'.isNotEmpty)
                        InfoCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(s.t('outcome.${d['outcome']}'), style: theme.textTheme.titleMedium),
                              if ('${d['decision_reason'] ?? ''}'.isNotEmpty) ...[
                                const SizedBox(height: Space.xs),
                                Text('${d['decision_reason']}', style: theme.textTheme.bodyLarge),
                              ],
                              if (d['can_accept'] == true) ...[
                                const SizedBox(height: Space.lg),
                                LoadingButton(
                                  label: s.t('dispute.accept'),
                                  onPressed: () => _post('accept', {'version': version}, 'dispute.done.accept'),
                                ),
                              ],
                              if (d['can_escalate'] == true) ...[
                                const SizedBox(height: Space.sm),
                                OutlinedButton(
                                  onPressed: () => _post('escalate', {'version': version}, 'dispute.done.escalate'),
                                  child: Text(s.t('dispute.escalate')),
                                ),
                              ],
                              if (d['can_reopen'] == true) ...[
                                const SizedBox(height: Space.sm),
                                OutlinedButton(
                                  onPressed: () => _post('reopen', {'version': version}, 'dispute.done.reopen'),
                                  child: Text(s.t('dispute.reopen')),
                                ),
                              ],
                              if ('${d['statement'] ?? ''}'.isNotEmpty) ...[
                                const SizedBox(height: Space.md),
                                Fact(s.t('dispute.statement'), '${d['statement']}'),
                              ] else if (d['can_add_statement'] == true) ...[
                                const SizedBox(height: Space.md),
                                TextField(
                                  controller: _statement,
                                  minLines: 3,
                                  maxLines: 6,
                                  onChanged: (_) => setState(() {}),
                                  decoration: InputDecoration(
                                    labelText: s.t('dispute.statement'),
                                    helperText: s.t('dispute.statementHint'),
                                    alignLabelWithHint: true,
                                  ),
                                ),
                                const SizedBox(height: Space.sm),
                                LoadingButton(
                                  label: s.t('dispute.addStatement'),
                                  onPressed: _statement.text.trim().length >= 10
                                      ? () => _post('disagreement', {'statement': _statement.text.trim()}, 'dispute.statementAdded')
                                      : null,
                                ),
                              ],
                            ],
                          ),
                        ),
                      if (status == 'info_requested')
                        Padding(
                          padding: const EdgeInsets.only(bottom: Space.md),
                          child: StatusPill(text: s.t('dispute.question'), tone: PillTone.ochre),
                        ),
                      for (final m in messages) _Bubble(message: m),
                    ],
                  ),
                ),
                if (open)
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
                            tooltip: s.t('send'),
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
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});

  final Json message;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final mine = message['author_role'] == 'patient';
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
            Text(mine ? s.t('you') : '${message['author_name'] ?? ''}', style: theme.textTheme.labelSmall),
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
