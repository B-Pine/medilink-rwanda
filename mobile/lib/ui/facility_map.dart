import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;

import '../app/config.dart';
import '../app/theme.dart';
import '../data/models.dart';
import 'icons.dart';

/// Facilities as pins on a map (OpenStreetMap tiles by default, AppConfig.mapTilesUrl), with the
/// patient's approximate position as a soft dot.
class FacilityMap extends StatelessWidget {
  const FacilityMap({
    super.key,
    required this.facilities,
    this.here,
    this.selected,
    this.onPin,
    this.interactive = true,
    this.controller,
  });

  final List<FacilitySummary> facilities;
  final LatLng? here;
  final String? selected;
  final ValueChanged<FacilitySummary>? onPin;
  final bool interactive;
  final MapController? controller;

  static LatLng? pointOf(FacilitySummary f) => f.lat == null || f.lng == null ? null : LatLng(f.lat!, f.lng!);

  LatLng get _center {
    if (here != null) return here!;
    final points = facilities.map(pointOf).whereType<LatLng>().toList();
    if (points.isEmpty) return const LatLng(AppConfig.defaultLat, AppConfig.defaultLng);
    final lat = points.map((p) => p.latitude).reduce((a, b) => a + b) / points.length;
    final lng = points.map((p) => p.longitude).reduce((a, b) => a + b) / points.length;
    return LatLng(lat, lng);
  }

  @override
  Widget build(BuildContext context) {
    final pins = [
      for (final f in facilities)
        if (pointOf(f) case final point?)
          Marker(
            point: point,
            width: 44,
            height: 52,
            alignment: Alignment.topCenter,
            child: GestureDetector(
              onTap: onPin == null ? null : () => onPin!(f),
              child: FacilityPin(emergency: f.emergency, selected: f.slug == selected),
            ),
          ),
    ];
    return FlutterMap(
      mapController: controller,
      options: MapOptions(
        initialCenter: _center,
        initialZoom: 13,
        minZoom: 7,
        maxZoom: 18,
        backgroundColor: Palette.brandSubtle,
        interactionOptions: InteractionOptions(
          flags: interactive ? InteractiveFlag.all & ~InteractiveFlag.rotate : InteractiveFlag.none,
        ),
      ),
      children: [
        TileLayer(urlTemplate: AppConfig.mapTilesUrl, userAgentPackageName: 'rw.medilink', maxNativeZoom: 19),
        if (here != null)
          MarkerLayer(markers: [Marker(point: here!, width: 28, height: 28, child: const _HereDot())]),
        MarkerLayer(markers: pins),
        if (interactive)
          const SimpleAttributionWidget(source: Text('OpenStreetMap'), backgroundColor: Color(0xCCFFFFFF)),
      ],
    );
  }
}

/// A facility on the map: a brand pin with a cross; red for a 24-hour emergency department.
class FacilityPin extends StatelessWidget {
  const FacilityPin({super.key, this.emergency = false, this.selected = false});

  final bool emergency;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final color = emergency ? Palette.danger : (selected ? Palette.forest : Palette.brand);
    return AnimatedScale(
      scale: selected ? 1.18 : 1,
      duration: const Duration(milliseconds: 180),
      alignment: Alignment.bottomCenter,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 3),
              boxShadow: [BoxShadow(color: Palette.forest.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 3))],
            ),
            child: const Icon(PhosphorIconsFill.firstAid, color: Colors.white, size: 18),
          ),
          CustomPaint(size: const Size(12, 8), painter: _Tip(color)),
        ],
      ),
    );
  }
}

class _Tip extends CustomPainter {
  const _Tip(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawPath(
      Path()
        ..moveTo(0, 0)
        ..lineTo(size.width, 0)
        ..lineTo(size.width / 2, size.height)
        ..close(),
      Paint()..color = Colors.white,
    );
    canvas.drawPath(
      Path()
        ..moveTo(2.5, 0)
        ..lineTo(size.width - 2.5, 0)
        ..lineTo(size.width / 2, size.height - 3)
        ..close(),
      Paint()..color = color,
    );
  }

  @override
  bool shouldRepaint(_Tip old) => old.color != color;
}

class _HereDot extends StatelessWidget {
  const _HereDot();

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(color: Palette.brand.withValues(alpha: 0.20), shape: BoxShape.circle),
        alignment: Alignment.center,
        child: Container(
          width: 14,
          height: 14,
          decoration: BoxDecoration(
            color: Palette.forest,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2.5),
          ),
        ),
      );
}
