import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';

import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/session.dart';
import '../../ui/feedback.dart';
import 'auth_layout.dart';

class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _accepted = false;
  bool _sent = false;
  bool _noEmail = false; // test server: no email, sign in now
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _ready =>
      _accepted && _name.text.trim().isNotEmpty && _email.text.contains('@') && _password.text.length >= 15;

  Future<bool> _submit() async {
    setState(() => _error = null);
    try {
      final ready = await ref.read(authProvider.notifier).register(
            fullName: _name.text.trim(),
            email: _email.text.trim(),
            password: _password.text,
          );
      setState(() {
        _sent = true;
        _noEmail = ready;
      });
      return true;
    } on ApiException catch (e) {
      setState(() => _error = e.message.isNotEmpty ? e.message : S.of(context).somethingWrong);
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final back = IconButton(
      onPressed: () => context.pop(),
      icon: const Icon(PhosphorIconsRegular.arrowLeft, color: Colors.white),
    );
    if (_sent) {
      return AuthLayout(
        title: _noEmail ? s.t('accountReady') : s.checkEmail,
        leading: Align(alignment: Alignment.centerLeft, child: back),
        children: [
          _noEmail
              ? EmptyState(icon: PhosphorIconsFill.checkCircle, text: s.t('accountReadyBody'))
              : EmptyState(icon: PhosphorIconsRegular.envelopeOpen, text: s.checkEmailBody),
          FilledButton(onPressed: () => context.pop(), child: Text(s.signIn)),
        ],
      );
    }
    return AuthLayout(
      title: s.createAccount,
      leading: Align(alignment: Alignment.centerLeft, child: back),
      children: [
        TextField(
          controller: _name,
          textCapitalization: TextCapitalization.words,
          autofillHints: const [AutofillHints.name],
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: s.fullName, prefixIcon: const Icon(PhosphorIconsRegular.user)),
        ),
        const SizedBox(height: Space.md),
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
        const SizedBox(height: Space.md),
        TextField(
          controller: _password,
          obscureText: true,
          autofillHints: const [AutofillHints.newPassword],
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            labelText: s.password,
            helperText: s.passwordRule,
            prefixIcon: const Icon(PhosphorIconsRegular.lockKey),
            suffixIcon: _password.text.length >= 15
                ? const Icon(PhosphorIconsFill.checkCircle, color: Palette.brand)
                : null,
          ),
        ),
        const SizedBox(height: Space.md),
        InkWell(
          borderRadius: BorderRadius.circular(Space.radiusSm),
          onTap: () => setState(() => _accepted = !_accepted),
          child: Row(
            children: [
              Checkbox(value: _accepted, onChanged: (v) => setState(() => _accepted = v ?? false)),
              Expanded(child: Text(s.acceptTerms)),
              IconButton(
                tooltip: s.privacy,
                onPressed: () => context.push('/legal/privacy'),
                icon: const Icon(PhosphorIconsRegular.info, color: Palette.muted),
              ),
            ],
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: Space.md),
            child: Text(_error!, style: const TextStyle(color: Palette.danger)),
          ),
        const SizedBox(height: Space.sm),
        LoadingButton(label: s.createAccount, onPressed: _ready ? _submit : null),
      ],
    );
  }
}
