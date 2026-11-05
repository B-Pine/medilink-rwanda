import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';

import '../../app/strings.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/providers.dart';
import '../../data/session.dart';
import '../../ui/feedback.dart';
import 'auth_layout.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _hidden = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<bool> _submit() async {
    final s = S.of(context);
    setState(() => _error = null);
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = s.signInFailed);
      return false;
    }
    try {
      await ref.read(authProvider.notifier).signIn(_email.text.trim(), _password.text);
      invalidatePatientData(ref);
      return true;
    } on ApiException catch (e) {
      setState(() => _error = switch (e.kind) {
            ApiFailure.offline => s.offline.split('·').first.trim(),
            ApiFailure.slow => s.slowConnection,
            ApiFailure.unauthenticated || ApiFailure.invalid => s.signInFailed,
            _ => e.detail.isNotEmpty ? e.detail : s.somethingWrong,
          });
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final language = ref.watch(languageProvider);
    return AuthLayout(
      title: s.signIn,
      leading: Align(
        alignment: Alignment.centerRight,
        child: TextButton(
          onPressed: () => ref.read(languageProvider.notifier).set(language == 'rw' ? 'en' : 'rw'),
          style: TextButton.styleFrom(foregroundColor: Colors.white),
          child: Text(language == 'rw' ? 'English' : 'Kinyarwanda'),
        ),
      ),
      children: [
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(
            labelText: s.email,
            prefixIcon: const Icon(PhosphorIconsRegular.envelopeSimple),
          ),
        ),
        const SizedBox(height: Space.md),
        TextField(
          controller: _password,
          obscureText: _hidden,
          autofillHints: const [AutofillHints.password],
          onSubmitted: (_) => _submit(),
          decoration: InputDecoration(
            labelText: s.password,
            prefixIcon: const Icon(PhosphorIconsRegular.lockKey),
            suffixIcon: IconButton(
              onPressed: () => setState(() => _hidden = !_hidden),
              icon: Icon(_hidden ? PhosphorIconsRegular.eye : PhosphorIconsRegular.eyeSlash),
            ),
          ),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 200),
          child: _error == null
              ? const SizedBox(height: Space.sm)
              : Padding(
                  padding: const EdgeInsets.only(top: Space.md),
                  child: Row(
                    children: [
                      const Icon(PhosphorIconsFill.warningCircle, color: Palette.danger, size: 18),
                      const SizedBox(width: Space.sm),
                      Expanded(
                        child: Text(_error!, style: const TextStyle(color: Palette.danger)),
                      ),
                    ],
                  ),
                ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () => context.push('/forgot-password'),
            child: Text(s.forgotPassword),
          ),
        ),
        const SizedBox(height: Space.sm),
        LoadingButton(label: s.signIn, onPressed: _submit),
        const SizedBox(height: Space.md),
        OutlinedButton(onPressed: () => context.push('/sign-up'), child: Text(s.createAccount)),
      ],
    );
  }
}
