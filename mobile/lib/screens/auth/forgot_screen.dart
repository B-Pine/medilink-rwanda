import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/session.dart';
import '../../ui/feedback.dart';
import '../../ui/icons.dart';
import 'auth_layout.dart';

/// Asks for a reset link; the link in the email opens the website's reset page.
class ForgotScreen extends ConsumerStatefulWidget {
  const ForgotScreen({super.key});

  @override
  ConsumerState<ForgotScreen> createState() => _ForgotScreenState();
}

class _ForgotScreenState extends ConsumerState<ForgotScreen> {
  final _email = TextEditingController();
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<bool> _send() async {
    setState(() => _error = null);
    try {
      await ref.read(apiProvider).post('/api/v1/auth/password-reset/', {'email': _email.text.trim()});
      setState(() => _sent = true);
      return true;
    } on ApiException catch (e) {
      setState(() => _error = e.detail.isNotEmpty ? e.detail : S.of(context).somethingWrong);
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return AuthLayout(
      title: s.t('resetTitle'),
      leading: Align(
        alignment: Alignment.centerLeft,
        child: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(PhosphorIconsRegular.arrowLeft, color: Colors.white),
        ),
      ),
      children: _sent
          ? [
              EmptyState(icon: PhosphorIconsRegular.envelopeOpen, text: s.t('resetSent')),
              FilledButton(onPressed: () => context.pop(), child: Text(s.signIn)),
            ]
          : [
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: s.email,
                  prefixIcon: const Icon(PhosphorIconsRegular.envelopeSimple),
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: Space.md),
                  child: Text(_error!, style: TextStyle(color: Palette.danger)),
                ),
              const SizedBox(height: Space.xl),
              LoadingButton(label: s.t('sendLink'), onPressed: _email.text.contains('@') ? _send : null),
            ],
    );
  }
}
