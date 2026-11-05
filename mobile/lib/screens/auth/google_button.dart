import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/providers.dart';
import '../../data/session.dart';
import '../../ui/icons.dart';

/// The server's Google client ID, or null when Sign in with Google is off (upgrade 17).
final googleClientIdProvider = FutureProvider<String?>(
  (ref) => ref.read(authProvider.notifier).googleClientId(),
);

/// "Continue with Google" under the sign-in and sign-up forms. Hidden when the server has it off.
/// A first Google sign-in asks for the same consents as sign-up before the account exists.
class GoogleButton extends ConsumerStatefulWidget {
  const GoogleButton({super.key, required this.onError});

  /// Shows a message under the form (the screens already have a place for it).
  final void Function(String? message) onError;

  @override
  ConsumerState<GoogleButton> createState() => _GoogleButtonState();
}

class _GoogleButtonState extends ConsumerState<GoogleButton> {
  bool _busy = false;

  Future<void> _go(String clientId) async {
    final s = S.of(context);
    final auth = ref.read(authProvider.notifier);
    widget.onError(null);
    setState(() => _busy = true);
    try {
      final ticket = await auth.pickGoogleAccount(clientId);
      if (ticket == null) return; // the picker was closed
      try {
        await auth.finishGoogle(ticket);
      } on ApiException catch (e) {
        if (e.code != 'consent_required' || !mounted) rethrow;
        final current = e.current is Map ? e.current! as Map : const {};
        final research = await _askConsent(
          email: '${current['email'] ?? ''}',
          name: '${current['full_name'] ?? ''}',
        );
        if (research == null) return; // closed without accepting
        await auth.finishGoogle(ticket, consent: true, research: research);
      }
      invalidatePatientData(ref);
    } on ApiException catch (e) {
      widget.onError(switch (e.kind) {
        ApiFailure.offline => s.offline.split('·').first.trim(),
        ApiFailure.slow => s.slowConnection,
        _ => e.message.isNotEmpty ? e.message : s.t('google.failed'),
      });
    } on GoogleSignInException {
      widget.onError(s.t('google.failed'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Terms and privacy are required, research is optional. Returns the research choice, or null.
  Future<bool?> _askConsent({required String email, required String name}) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _ConsentSheet(email: email, name: name),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final clientId = ref.watch(googleClientIdProvider).value;
    if (clientId == null) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: Space.md),
        Row(
          children: [
            const Expanded(child: Divider()),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Space.md),
              child: Text(s.t('google.or'), style: Theme.of(context).textTheme.labelMedium),
            ),
            const Expanded(child: Divider()),
          ],
        ),
        const SizedBox(height: Space.md),
        OutlinedButton.icon(
          onPressed: _busy ? null : () => _go(clientId),
          icon: _busy
              ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(PhosphorIconsRegular.googleLogo),
          label: Text(s.t('google.continue')),
        ),
      ],
    );
  }
}

class _ConsentSheet extends StatefulWidget {
  const _ConsentSheet({required this.email, required this.name});

  final String email;
  final String name;

  @override
  State<_ConsentSheet> createState() => _ConsentSheetState();
}

class _ConsentSheetState extends State<_ConsentSheet> {
  bool _terms = false;
  bool _research = false;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Space.xl, 0, Space.xl, Space.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(s.t('google.consentTitle'), style: theme.textTheme.titleLarge),
            const SizedBox(height: Space.xs),
            Text(
              [widget.name, widget.email].where((v) => v.isNotEmpty).join(' · '),
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: Space.lg),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: _terms,
              onChanged: (v) => setState(() => _terms = v ?? false),
              title: Text(s.acceptTerms),
              secondary: IconButton(
                tooltip: s.privacy,
                onPressed: () => context.push('/legal/privacy'),
                icon: const Icon(PhosphorIconsRegular.info, color: Palette.muted),
              ),
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: _research,
              onChanged: (v) => setState(() => _research = v ?? false),
              title: Text(s.t('consent.research')),
              subtitle: Text(s.t('google.researchHint')),
            ),
            const SizedBox(height: Space.lg),
            FilledButton(
              onPressed: _terms ? () => Navigator.pop(context, _research) : null,
              child: Text(s.createAccount),
            ),
          ],
        ),
      ),
    );
  }
}
