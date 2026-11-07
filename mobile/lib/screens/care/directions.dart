import 'package:url_launcher/url_launcher.dart';

/// Opens Google Maps (or the browser) with directions to a facility.
Future<void> openDirections({required String name, String place = '', double? lat, double? lng}) {
  final destination = (lat != null && lng != null) ? '$lat,$lng' : '$name, $place, Rwanda';
  final uri = Uri.https('www.google.com', '/maps/dir/', {'api': '1', 'destination': destination});
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}

Future<void> call(String phone) => launchUrl(Uri(scheme: 'tel', path: phone.replaceAll(' ', '')));
