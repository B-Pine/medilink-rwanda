/// Photos on Cloudinary, as the website sends them: the API signs, the phone posts the file
/// straight to Cloudinary, then the profile keeps the returned public id (the API checks it).
library;

import 'package:dio/dio.dart';

import 'api.dart';

/// The server has no Cloudinary account (503 `uploads_unavailable`).
bool uploadsUnavailable(Object error) => error is ApiException && error.status == 503;

/// Signs, uploads and returns the Cloudinary public id of [filePath] for [kind]
/// (`patient_avatar`). Throws [ApiException] (signature) or [DioException] (upload).
Future<String> uploadToCloudinary(Api api, String filePath, {String kind = 'patient_avatar'}) async {
  final sig = await api.post('/api/v1/patient/uploads/signature/', {'kind': kind});
  if (sig is! Map) throw DioException(requestOptions: RequestOptions(path: 'signature'));
  final form = FormData.fromMap({
    'file': await MultipartFile.fromFile(filePath, filename: 'photo.jpg'),
    // exactly the signed parameters, as the API returned them
    'api_key': '${sig['api_key']}',
    'timestamp': '${sig['timestamp']}',
    'signature': '${sig['signature']}',
    'upload_preset': '${sig['upload_preset']}',
    'asset_folder': '${sig['asset_folder']}',
    'tags': '${sig['tags']}',
  });
  // a bare client: no MediLink cookies or headers go to Cloudinary
  final response = await Dio().post<Map<String, dynamic>>('${sig['upload_url']}', data: form);
  final id = response.data?['public_id'];
  if (id is! String || id.isEmpty) throw DioException(requestOptions: response.requestOptions);
  return id;
}
