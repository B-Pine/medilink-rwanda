import 'package:dio/dio.dart';

import '../app/config.dart';
import 'secure_store.dart';

/// Why a call failed, in the app's terms.
class ApiException implements Exception {
  ApiException(this.kind, {this.status, this.code = '', this.message = '', this.fields = const {}});

  final ApiFailure kind;
  final int? status;
  final String code;
  final String message;

  /// Per-field messages of a validation error (`error.fields`), e.g. {'new_password': [...]}.
  final Map<String, List<String>> fields;

  /// The message for [field], or null.
  String? field(String field) => fields[field]?.firstOrNull;

  /// What to show the patient: the first field message when there is one (it says what to fix),
  /// otherwise the general message.
  String get detail => fields.values.expand((m) => m).firstOrNull ?? message;

  @override
  String toString() => 'ApiException($kind, $status, $code)';
}

enum ApiFailure { offline, slow, unauthenticated, invalid, conflict, server }

/// The MediLink API. The patient session travels in a header (security 03 §5):
/// `X-MediLink-Client: app` on every call, `Authorization: Bearer <key>` on patient calls, and a
/// new or ended key comes back in `X-Session-Token`.
class Api {
  Api(this._store, {required this.onSessionEnded, String Function()? language})
      : _language = language ?? (() => 'rw') {
    _dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'X-MediLink-Client': 'app', 'Accept': 'application/json'},
      ),
    );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          options.headers['Accept-Language'] = _language();
          final key = _store.sessionKey;
          if (key != null && options.path.startsWith('/api/v1/patient/')) {
            options.headers['Authorization'] = 'Bearer $key';
          }
          handler.next(options);
        },
        onResponse: (response, handler) async {
          await _readToken(response.headers);
          handler.next(response);
        },
        onError: (error, handler) async {
          final response = error.response;
          if (response != null) await _readToken(response.headers);
          handler.next(error);
        },
      ),
    );
  }

  final SecureStore _store;
  final void Function() onSessionEnded;
  final String Function() _language;
  late final Dio _dio;

  Future<void> _readToken(Headers headers) async {
    final values = headers.map['x-session-token'];
    if (values == null) return;
    final token = values.isEmpty ? '' : values.first;
    if (token.isEmpty) {
      final hadSession = _store.sessionKey != null;
      await _store.saveSessionKey(null);
      if (hadSession) onSessionEnded();
    } else {
      await _store.saveSessionKey(token);
    }
  }

  Future<Object?> get(String path, {Map<String, Object?>? query}) =>
      _send(() => _dio.get<Object?>(path, queryParameters: _clean(query)));

  Future<Object?> post(String path, [Object? body]) =>
      _send(() => _dio.post<Object?>(path, data: body ?? const <String, Object?>{}));

  Future<Object?> patch(String path, Object body) => _send(() => _dio.patch<Object?>(path, data: body));

  Future<Object?> delete(String path) => _send(() => _dio.delete<Object?>(path));

  Map<String, Object?>? _clean(Map<String, Object?>? query) =>
      query == null ? null : (Map.of(query)..removeWhere((_, v) => v == null || v == ''));

  Future<Object?> _send(Future<Response<Object?>> Function() call) async {
    try {
      return (await call()).data;
    } on DioException catch (e) {
      throw _map(e);
    }
  }

  ApiException _map(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionError:
        return ApiException(ApiFailure.offline);
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return ApiException(ApiFailure.slow);
      default:
        break;
    }
    final status = e.response?.statusCode;
    final data = e.response?.data;
    final error = data is Map ? data['error'] : null;
    final code = error is Map ? '${error['code'] ?? ''}' : '';
    final message = error is Map ? '${error['message'] ?? ''}' : '';
    final kind = switch (status) {
      401 || 403 when code != 'csrf_failed' => ApiFailure.unauthenticated,
      400 || 422 => ApiFailure.invalid,
      409 || 412 => ApiFailure.conflict,
      null => ApiFailure.offline,
      _ => ApiFailure.server,
    };
    final raw = error is Map ? error['fields'] : null;
    final fields = <String, List<String>>{
      if (raw is Map)
        for (final MapEntry(:key, :value) in raw.entries)
          '$key': value is List ? [for (final m in value) '$m'] : ['$value'],
    };
    return ApiException(kind, status: status, code: code, message: message, fields: fields);
  }
}
