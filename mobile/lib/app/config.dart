/// Build-time configuration: `flutter build apk --dart-define=API_BASE_URL=https://…`.
class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://medilink-rwanda-production.up.railway.app',
  );

  /// The public website, for pages the app links to (terms, privacy, help).
  static const webBaseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'https://medilink-rwanda.vercel.app',
  );

  /// Map tiles, same default as the website (VITE_MAP_TILES_URL). The OpenStreetMap tile policy
  /// does not allow production traffic: set a provider for Rwanda before release (OD-3).
  static const mapTilesUrl = String.fromEnvironment(
    'MAP_TILES_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );

  /// Kigali, when the phone's location is unknown.
  static const defaultLat = -1.9441;
  static const defaultLng = 30.0619;

  /// Rwanda's emergency medical number (SAMU).
  static const emergencyNumber = '912';

  /// Versions of the terms and privacy notice accepted at sign-up (same as the website).
  static const termsVersion = '2026-10';
  static const privacyVersion = '2026-10';

  static const autoLockAfter = Duration(minutes: 2);
  static const trackerPoll = Duration(seconds: 15);
  static const pinAttempts = 5;
}
