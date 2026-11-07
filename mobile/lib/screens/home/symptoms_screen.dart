import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/config.dart';
import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../data/session.dart';
import '../../ui/feedback.dart';
import '../../ui/icons.dart';
import '../care/facility_mini_card.dart';

/// Symptom checker (upgrade 07, AI decisions 2026-11-03): red flags first, soft wording
/// ("you may have X, see a doctor"). The chat uses /public/assistant/; when it is switched off
/// (503) the screen falls back to the rules checklist (/public/triage/).
class SymptomsScreen extends ConsumerStatefulWidget {
  const SymptomsScreen({super.key});

  @override
  ConsumerState<SymptomsScreen> createState() => _SymptomsScreenState();
}

class _Turn {
  _Turn.user(this.text)
      : mine = true,
        kind = 'user',
        condition = null,
        named = false,
        serviceCode = null,
        urgency = null,
        redFlags = const [];
  _Turn.reply(Json j)
      : mine = false,
        text = j['reply'] as String? ?? '',
        kind = j['kind'] as String? ?? 'answer',
        condition = j['condition'] as String?,
        named = j['named'] as bool? ?? false,
        serviceCode = j['service_code'] as String?,
        urgency = j['urgency'] as String?,
        redFlags = (j['red_flags'] as List? ?? const []).map((e) => '$e').toList();
  final bool mine;
  final String text, kind;
  final String? condition, serviceCode, urgency;

  /// Whether the possible cause may be named (soft wording, AI decisions 2026-11-03).
  final bool named;
  final List<String> redFlags;
}

class _SymptomsScreenState extends ConsumerState<SymptomsScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _turns = <_Turn>[];
  Json _state = {};
  bool _busy = false;
  bool _checklist = false;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Sends the typed message, or [quick] (a Yes / No / Not sure tap).
  Future<void> _send([String? quick]) async {
    final text = (quick ?? _input.text).trim();
    if (text.isEmpty || _busy) return;
    if (quick != null) HapticFeedback.selectionClick();
    setState(() {
      _turns.add(_Turn.user(text));
      _busy = true;
      if (quick == null) _input.clear();
    });
    _toEnd();
    try {
      final data = await ref.read(apiProvider).post('/api/v1/public/assistant/', {
        'message': text,
        'language': ref.read(languageProvider),
        'state': _state,
      }) as Json;
      final turn = _Turn.reply(data);
      if (turn.kind == 'emergency') HapticFeedback.heavyImpact();
      setState(() {
        _state = (data['state'] as Map?)?.cast<String, dynamic>() ?? {};
        _turns.add(turn);
      });
    } on ApiException catch (e) {
      if (e.status == 503) {
        setState(() => _checklist = true);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(S.of(context).somethingWrong)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
      _toEnd();
    }
  }

  void _toEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) {
          _scroll.animateTo(_scroll.position.maxScrollExtent,
              duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
        }
      });

  void _reset() => setState(() {
        _turns.clear();
        _state = {};
      });

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(s.symptoms),
        actions: [
          if (!_checklist && _turns.isNotEmpty)
            IconButton(tooltip: s.t('newChat'), onPressed: _reset, icon: const Icon(PhosphorIconsRegular.arrowClockwise)),
          TextButton(
            onPressed: () => setState(() => _checklist = !_checklist),
            child: Text(_checklist ? s.symptoms : s.t('checklist')),
          ),
        ],
      ),
      body: Column(
        children: [
          const _EmergencyStrip(),
          Expanded(child: _checklist ? const _Checklist() : _chat(s)),
        ],
      ),
    );
  }

  Widget _chat(Strings s) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Expanded(
          child: ListView(
            controller: _scroll,
            padding: const EdgeInsets.all(Space.lg),
            children: [
              if (_turns.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: Space.xxl),
                  child: Column(
                    children: [
                      Container(
                        width: 64,
                        height: 64,
                        decoration: const BoxDecoration(color: Palette.brandSubtle, shape: BoxShape.circle),
                        child: const Icon(PhosphorIconsRegular.stethoscope, color: Palette.brand, size: 30),
                      ),
                      const SizedBox(height: Space.lg),
                      Text(s.t('symptomsTitle'), style: theme.textTheme.headlineSmall),
                      const SizedBox(height: Space.xs),
                      Text(s.t('guidanceOnly'), style: theme.textTheme.bodySmall),
                    ],
                  ),
                ),
              for (final turn in _turns) _Bubble(turn: turn),
              if (_busy) const Align(alignment: Alignment.centerLeft, child: _Typing()),
              // the assistant asked about one symptom: answer with a tap
              if (!_busy && _turns.isNotEmpty && _turns.last.kind == 'question')
                _QuickReplies(onPick: _send),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.sm, Space.md),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _input,
                    minLines: 1,
                    maxLines: 4,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _send(),
                    decoration: InputDecoration(hintText: s.t('symptomsHint')),
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
  }
}

class _EmergencyStrip extends StatelessWidget {
  const _EmergencyStrip();

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Material(
      color: Palette.dangerSubtle,
      child: InkWell(
        onTap: () => launchUrl(Uri.parse('tel:${AppConfig.emergencyNumber}')),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.sm),
          child: Row(
            children: [
              const Icon(PhosphorIconsFill.phoneCall, color: Palette.danger, size: 18),
              const SizedBox(width: Space.sm),
              Expanded(
                child: Text(s.emergency, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w600)),
              ),
              const Text(AppConfig.emergencyNumber, style: TextStyle(color: Palette.danger, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.turn});

  final _Turn turn;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    if (turn.kind == 'emergency') {
      return _UrgentCard(
        title: s.t('getHelpNow'),
        lines: [if (turn.text.isNotEmpty) turn.text, ...turn.redFlags],
      );
    }
    final mine = turn.mine;
    final bubble = Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
        margin: const EdgeInsets.only(bottom: Space.sm),
        padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.md),
        decoration: BoxDecoration(
          color: mine ? Palette.brand : Palette.surface,
          border: mine ? null : Border.all(color: Palette.hairline),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (turn.kind == 'answer' && turn.named && turn.condition != null) ...[
              Text(s.t('mayHave'), style: theme.textTheme.labelSmall),
              Text(turn.condition!, style: theme.textTheme.titleMedium?.copyWith(color: Palette.brand)),
              const SizedBox(height: Space.xs),
            ],
            Text(turn.text, style: theme.textTheme.bodyLarge?.copyWith(color: mine ? Colors.white : Palette.ink)),
            if (turn.kind == 'answer') ...[
              const SizedBox(height: Space.sm),
              Text(s.t('seeDoctor'), style: theme.textTheme.bodySmall),
            ],
          ],
        ),
      ),
    );
    if (turn.kind != 'answer') return bubble;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [bubble, _AnswerPlaces(serviceCode: turn.serviceCode ?? 'general_consultation')],
    );
  }
}

/// Yes / No / Not sure, sent as the patient's reply ("yego" / "oya" are understood too).
class _QuickReplies extends StatelessWidget {
  const _QuickReplies({required this.onPick});
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final options = [
      (s.t('answerYes'), PhosphorIconsBold.check),
      (s.t('answerNo'), PhosphorIconsRegular.xCircle),
      (s.t('answerNotSure'), PhosphorIconsRegular.question),
    ];
    return Padding(
      padding: const EdgeInsets.only(top: Space.xs, bottom: Space.sm),
      child: Wrap(
        alignment: WrapAlignment.end,
        spacing: Space.sm,
        runSpacing: Space.sm,
        children: [
          for (final (label, icon) in options)
            OutlinedButton.icon(
              onPressed: () => onPick(label),
              icon: Icon(icon, size: 18),
              label: Text(label),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 44),
                foregroundColor: Palette.brand,
                side: const BorderSide(color: Palette.brand),
                shape: const StadiumBorder(),
              ),
            ),
        ],
      ),
    );
  }
}

/// The places the answer points to: facilities offering the suggested service, nearest first
/// when location is on.
class _AnswerPlaces extends ConsumerWidget {
  const _AnswerPlaces({required this.serviceCode});
  final String serviceCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final query = ref.watch(nearbyQueryProvider).copyWith(serviceCode: serviceCode);
    final places = ref.watch(facilitySearchProvider(query));
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.xs, Space.sm, Space.xs, Space.sm),
            child: Text(s.t('placesForYou'), style: theme.textTheme.titleSmall),
          ),
          places.when(
            loading: () => const SizedBox(height: 230, child: Skeleton(height: 230, radius: Space.radiusLg)),
            error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(facilitySearchProvider(query))),
            data: (list) => list.isEmpty
                ? Text(s.t('noPlacesForService'), style: theme.textTheme.bodySmall)
                : SizedBox(
                    height: 272,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: list.take(6).length,
                      separatorBuilder: (_, _) => const SizedBox(width: Space.md),
                      itemBuilder: (context, i) => SizedBox(
                        width: 250,
                        child: Padding(
                          padding: const EdgeInsets.only(bottom: Space.sm),
                          child: FacilityMiniCard(facility: list[i]),
                        ),
                      ),
                    ),
                  ),
          ),
          const SizedBox(height: Space.sm),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => context.go('/care'),
              icon: const Icon(PhosphorIconsRegular.mapPin, size: 18),
              label: Text(s.t('morePlaces')),
            ),
          ),
        ],
      ),
    );
  }
}

class _UrgentCard extends StatelessWidget {
  const _UrgentCard({required this.title, required this.lines});

  final String title;
  final List<String> lines;

  @override
  Widget build(BuildContext context) => Card(
        color: Palette.dangerSubtle,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Space.radius),
          side: const BorderSide(color: Palette.danger),
        ),
        margin: const EdgeInsets.only(bottom: Space.sm),
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Icon(PhosphorIconsFill.warningCircle, color: Palette.danger),
                  const SizedBox(width: Space.sm),
                  Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Palette.danger)),
                ],
              ),
              for (final line in lines)
                Padding(padding: const EdgeInsets.only(top: Space.sm), child: Text(line)),
              const SizedBox(height: Space.md),
              FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: Palette.danger),
                onPressed: () => launchUrl(Uri.parse('tel:${AppConfig.emergencyNumber}')),
                icon: const Icon(PhosphorIconsFill.phoneCall),
                label: const Text(AppConfig.emergencyNumber),
              ),
            ],
          ),
        ),
      );
}

class _Typing extends StatelessWidget {
  const _Typing();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.md + 2),
        decoration: BoxDecoration(
          color: Palette.surface,
          border: Border.all(color: Palette.hairline),
          borderRadius: BorderRadius.circular(16),
        ),
        child: const DefaultTextStyle(style: TextStyle(color: Palette.brand), child: LoadingDots()),
      );
}


/// The rules checklist: symptoms, how long, age group → urgency and where to go.
class _Checklist extends ConsumerStatefulWidget {
  const _Checklist();

  @override
  ConsumerState<_Checklist> createState() => _ChecklistState();
}

class _ChecklistState extends ConsumerState<_Checklist> {
  final _picked = <String>{};
  String _since = 'today';
  String _age = 'adult';
  bool _pregnant = false;
  Json? _result;

  Future<bool> _check() async {
    try {
      final data = await ref.read(apiProvider).post('/api/v1/public/triage/', {
        'symptoms': _picked.toList(),
        'duration': _since,
        'age_group': _age,
        if (_pregnant) 'pregnant': true,
      }) as Json;
      if (data['urgency'] == 'emergency') HapticFeedback.heavyImpact();
      setState(() => _result = data);
      return true;
    } on ApiException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(S.of(context).somethingWrong)));
      }
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final symptoms = ref.watch(symptomsProvider);
    Widget choices(String label, List<String> options, String value, String prefix, ValueChanged<String> onPick) =>
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: theme.textTheme.titleSmall),
            const SizedBox(height: Space.sm),
            Wrap(
              spacing: Space.sm,
              runSpacing: Space.sm,
              children: [
                for (final o in options)
                  ChoiceChip(
                    label: Text(s.t('$prefix.$o')),
                    selected: o == value,
                    showCheckmark: false,
                    selectedColor: Palette.brandSubtle,
                    onSelected: (_) => onPick(o),
                  ),
              ],
            ),
            const SizedBox(height: Space.xl),
          ],
        );
    return ListView(
      padding: const EdgeInsets.all(Space.lg),
      children: [
        if (_result != null) ...[_TriageResult(result: _result!), const SizedBox(height: Space.xl)],
        Text(s.t('chooseSymptoms'), style: theme.textTheme.titleSmall),
        const SizedBox(height: Space.sm),
        symptoms.when(
          loading: () => const SkeletonList(count: 2),
          error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(symptomsProvider)),
          data: (list) => Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            children: [
              for (final sym in list)
                FilterChip(
                  label: Text(s.pick(sym.name)),
                  selected: _picked.contains(sym.code),
                  showCheckmark: false,
                  selectedColor: sym.redFlag ? Palette.dangerSubtle : Palette.brandSubtle,
                  side: BorderSide(color: sym.redFlag ? Palette.danger.withValues(alpha: 0.4) : Palette.hairline),
                  onSelected: (on) => setState(() => on ? _picked.add(sym.code) : _picked.remove(sym.code)),
                ),
            ],
          ),
        ),
        const SizedBox(height: Space.xl),
        choices(s.t('since'), const ['today', 'days', 'week'], _since, 'since', (v) => setState(() => _since = v)),
        choices(s.t('ageGroup'), const ['infant', 'child', 'teen', 'adult', 'older'], _age, 'age',
            (v) => setState(() => _age = v)),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(s.t('pregnant')),
          value: _pregnant,
          onChanged: (v) => setState(() => _pregnant = v),
        ),
        const SizedBox(height: Space.lg),
        LoadingButton(label: s.t('check'), onPressed: _picked.isEmpty ? null : _check),
        const SizedBox(height: Space.md),
        Text(s.t('guidanceOnly'), style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
      ],
    );
  }
}

class _TriageResult extends StatelessWidget {
  const _TriageResult({required this.result});

  final Json result;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final urgency = result['urgency'] as String? ?? 'soon';
    final flags = (result['red_flags'] as List? ?? const []).map((e) => '$e').toList();
    final reasons = (result['reasons'] as List? ?? const []).map((e) => '$e').toList();
    if (urgency == 'emergency') {
      return _UrgentCard(title: s.t('urgency.emergency'), lines: [...flags, ...reasons]);
    }
    final tone = urgency == 'self_care' ? Palette.brand : Palette.ochreText;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Space.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(s.t('urgency.$urgency'), style: Theme.of(context).textTheme.titleLarge?.copyWith(color: tone)),
            for (final r in reasons) Padding(padding: const EdgeInsets.only(top: Space.sm), child: Text(r)),
            const SizedBox(height: Space.md),
            FilledButton.icon(
              onPressed: () => context.go('/care'),
              icon: const Icon(PhosphorIconsRegular.mapPin),
              label: Text(s.findCare),
            ),
          ],
        ),
      ),
    );
  }
}
