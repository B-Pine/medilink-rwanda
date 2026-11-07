import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Everything sensitive the app keeps lives in the Android Keystore-backed secure storage:
/// the session key, the PIN and the offline copies of the patient's data (upgrade 15 §4).
class SecureStore {
  SecureStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _session = 'session_key';
  static const _pin = 'pin';
  static const _biometrics = 'biometrics';
  static const _cachePrefix = 'cache.';

  String? _sessionKey;

  String? get sessionKey => _sessionKey;

  Future<String?> loadSessionKey() async => _sessionKey = await _storage.read(key: _session);

  Future<void> saveSessionKey(String? key) async {
    _sessionKey = (key == null || key.isEmpty) ? null : key;
    if (_sessionKey == null) {
      await _storage.delete(key: _session);
    } else {
      await _storage.write(key: _session, value: _sessionKey);
    }
  }

  Future<String?> readPin() => _storage.read(key: _pin);
  Future<void> savePin(String pin) => _storage.write(key: _pin, value: pin);

  Future<bool> biometricsEnabled() async => await _storage.read(key: _biometrics) == '1';
  Future<void> setBiometrics(bool on) => _storage.write(key: _biometrics, value: on ? '1' : '0');

  Future<Object?> readCache(String name) async {
    final raw = await _storage.read(key: '$_cachePrefix$name');
    return raw == null ? null : jsonDecode(raw);
  }

  Future<void> writeCache(String name, Object? data) =>
      _storage.write(key: '$_cachePrefix$name', value: jsonEncode(data));

  /// Sign-out: forget the session, the PIN and every offline copy.
  Future<void> wipe() async {
    _sessionKey = null;
    await _storage.deleteAll();
  }
}
