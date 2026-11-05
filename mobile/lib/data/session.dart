import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app/config.dart';
import 'api.dart';
import 'models.dart';
import 'secure_store.dart';

enum AuthPhase { starting, signedOut, setPin, locked, ready }

final secureStoreProvider = Provider<SecureStore>((ref) => SecureStore());

final languageProvider = NotifierProvider<LanguageController, String>(LanguageController.new);

class LanguageController extends Notifier<String> {
  static const _key = 'language';

  @override
  String build() {
    SharedPreferences.getInstance().then((prefs) {
      final saved = prefs.getString(_key);
      if (saved != null && saved != state) state = saved;
    });
    return 'rw';
  }

  Future<void> set(String code) async {
    state = code;
    (await SharedPreferences.getInstance()).setString(_key, code);
  }
}

final apiProvider = Provider<Api>(
  (ref) => Api(
    ref.read(secureStoreProvider),
    onSessionEnded: () => ref.read(authProvider.notifier).sessionEnded(),
    language: () => ref.read(languageProvider),
  ),
);

final authProvider = NotifierProvider<AuthController, AuthPhase>(AuthController.new);

/// Sign-in, PIN and fingerprint. The server session is the patient session carried in a header;
/// the PIN only unlocks this phone (upgrade 15 §4).
class AuthController extends Notifier<AuthPhase> {
  final _localAuth = LocalAuthentication();
  int _failedPins = 0;

  SecureStore get _store => ref.read(secureStoreProvider);
  Api get _api => ref.read(apiProvider);

  @override
  AuthPhase build() {
    Future.microtask(_start);
    return AuthPhase.starting;
  }

  Future<void> _start() async {
    final started = DateTime.now();
    final key = await _store.loadSessionKey();
    final pin = key == null ? null : await _store.readPin();
    // Let the splash mark finish drawing (about half a second), never longer.
    final elapsed = DateTime.now().difference(started);
    const draw = Duration(milliseconds: 650);
    if (elapsed < draw) await Future<void>.delayed(draw - elapsed);
    state = key == null
        ? AuthPhase.signedOut
        : pin == null
            ? AuthPhase.setPin
            : AuthPhase.locked;
  }

  Future<Me> signIn(String email, String password) async {
    final data = await _api.post('/api/v1/patient/auth/login/', {'email': email, 'password': password});
    if (_store.sessionKey == null) {
      throw ApiException(ApiFailure.server, message: 'No session key returned');
    }
    final me = Me.fromJson(data! as Json);
    await ref.read(languageProvider.notifier).set(me.language == 'en' ? 'en' : 'rw');
    state = AuthPhase.setPin;
    return me;
  }

  Future<void> register({
    required String fullName,
    required String email,
    required String password,
  }) async {
    await _api.post('/api/v1/patient/auth/register/', {
      'full_name': fullName,
      'email': email,
      'password': password,
      'preferred_language': ref.read(languageProvider),
      'accepted_terms_version': AppConfig.termsVersion,
      'accepted_privacy_version': AppConfig.privacyVersion,
      'research_consent': false,
    });
  }

  Future<void> savePin(String pin, {required bool biometrics}) async {
    await _store.savePin(pin);
    await _store.setBiometrics(biometrics);
    _failedPins = 0;
    state = AuthPhase.ready;
  }

  /// Returns false on a wrong PIN; too many wrong PINs sign out.
  Future<bool> unlock(String pin) async {
    if (pin == await _store.readPin()) {
      _failedPins = 0;
      state = AuthPhase.ready;
      return true;
    }
    _failedPins++;
    if (_failedPins >= AppConfig.pinAttempts) await signOut();
    return false;
  }

  Future<bool> canUseBiometrics() async {
    try {
      return await _localAuth.isDeviceSupported() && await _localAuth.canCheckBiometrics;
    } on Exception {
      return false;
    }
  }

  Future<bool> biometricsEnabled() => _store.biometricsEnabled();

  Future<void> setBiometrics(bool on) => _store.setBiometrics(on);

  Future<bool> unlockWithBiometrics(String reason) async {
    try {
      final ok = await _localAuth.authenticate(localizedReason: reason, biometricOnly: true);
      if (ok) {
        _failedPins = 0;
        state = AuthPhase.ready;
      }
      return ok;
    } on Exception catch (e) {
      debugPrint('Biometric unlock failed: $e');
      return false;
    }
  }

  void lock() {
    if (state == AuthPhase.ready) state = AuthPhase.locked;
  }

  Future<void> signOut() async {
    try {
      await _api.post('/api/v1/patient/auth/logout/');
    } on ApiException {
      // Offline or already ended: the phone forgets the session either way.
    }
    await _store.wipe();
    state = AuthPhase.signedOut;
  }

  /// The server ended the session (expired, revoked, signed out elsewhere).
  Future<void> sessionEnded() async {
    await _store.wipe();
    state = AuthPhase.signedOut;
  }
}
