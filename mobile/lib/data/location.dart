import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

/// The phone's approximate position for "Near you" (coarse location only, asked when the
/// patient taps "Use my location"; rounded to about 1 km before it is sent to the API).
class Located {
  const Located({this.point, this.busy = false, this.blocked = false});

  final LatLng? point;
  final bool busy;

  /// The patient refused for good, or location is off: the button opens the settings instead.
  final bool blocked;
}

final locationProvider = NotifierProvider<LocationController, Located>(LocationController.new);

class LocationController extends Notifier<Located> {
  @override
  Located build() {
    Future.microtask(_quiet);
    return const Located();
  }

  /// Uses the position only if permission was given before: never prompts on its own.
  Future<void> _quiet() async {
    try {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.always || permission == LocationPermission.whileInUse) {
        await _read();
      }
    } on Object catch (e) {
      debugPrint('Location unavailable: $e');
    }
  }

  /// Asks for permission (the patient tapped "Use my location"). Returns true when located.
  Future<bool> request() async {
    state = Located(point: state.point, busy: true);
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        state = Located(point: state.point, blocked: true);
        await Geolocator.openLocationSettings();
        return false;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.deniedForever) {
        state = Located(point: state.point, blocked: true);
        await Geolocator.openAppSettings();
        return false;
      }
      if (permission == LocationPermission.denied) {
        state = Located(point: state.point);
        return false;
      }
      await _read();
      return state.point != null;
    } on Object catch (e) {
      debugPrint('Location request failed: $e');
      state = Located(point: state.point);
      return false;
    }
  }

  Future<void> _read() async {
    final last = await Geolocator.getLastKnownPosition();
    if (last != null) state = Located(point: _round(last.latitude, last.longitude));
    final now = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.low, timeLimit: Duration(seconds: 12)),
    );
    state = Located(point: _round(now.latitude, now.longitude));
  }

  /// Two decimals: about 1 km, enough to sort facilities by distance.
  static LatLng _round(double lat, double lng) =>
      LatLng((lat * 100).roundToDouble() / 100, (lng * 100).roundToDouble() / 100);
}
