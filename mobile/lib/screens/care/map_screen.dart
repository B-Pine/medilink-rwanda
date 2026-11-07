import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/location.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../ui/facility_map.dart';
import '../../ui/feedback.dart';
import '../../ui/icons.dart';
import 'facility_mini_card.dart';

/// Facilities on a full-screen map; the cards at the bottom follow the selected pin and
/// swiping them moves the map.
class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  final _map = MapController();
  final _pages = PageController(viewportFraction: 0.86);
  String? _selected;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _select(List<FacilitySummary> list, int index, {bool fromPin = false}) {
    final f = list[index];
    setState(() => _selected = f.slug);
    final point = FacilityMap.pointOf(f);
    if (point != null) _map.move(point, _map.camera.zoom < 13 ? 14 : _map.camera.zoom);
    if (fromPin) {
      HapticFeedback.selectionClick();
      _pages.animateToPage(index, duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final here = ref.watch(locationProvider);
    final results = ref.watch(facilitySearchProvider(ref.watch(nearbyQueryProvider)));
    final list = (results.value ?? const <FacilitySummary>[]).where((f) => f.lat != null).toList();
    final top = MediaQuery.paddingOf(context).top;
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: FacilityMap(
              controller: _map,
              facilities: list,
              here: here.point,
              selected: _selected,
              onPin: (f) => _select(list, list.indexOf(f), fromPin: true),
              // Under the top bar (8 + 48 + 8), clear of the cards at the bottom.
              attributionTop: Space.sm + 48 + Space.xs,
            ),
          ),
          Positioned(
            left: Space.lg,
            right: Space.lg,
            top: top + Space.sm,
            child: Row(
              children: [
                _RoundButton(icon: PhosphorIconsRegular.arrowLeft, onTap: () => context.pop()),
                const SizedBox(width: Space.sm),
                Expanded(
                  child: Container(
                    height: 48,
                    padding: const EdgeInsets.symmetric(horizontal: Space.lg),
                    alignment: Alignment.centerLeft,
                    decoration: BoxDecoration(
                      color: Palette.surface,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: Shadows.floating,
                    ),
                    child: Text(s.t('map'), style: Theme.of(context).textTheme.titleMedium),
                  ),
                ),
                const SizedBox(width: Space.sm),
                _RoundButton(
                  icon: here.point == null ? PhosphorIconsRegular.crosshair : PhosphorIconsFill.crosshair,
                  busy: here.busy,
                  onTap: () async {
                    final ok = here.point != null || await ref.read(locationProvider.notifier).request();
                    final point = ref.read(locationProvider).point;
                    if (ok && point != null) _map.move(point, 14);
                  },
                ),
              ],
            ),
          ),
          if (results.isLoading)
            const Positioned(left: 0, right: 0, bottom: 40, child: Center(child: SizedBox(width: 120, child: LinearProgressIndicator()))),
          if (list.isNotEmpty)
            Positioned(
              left: 0,
              right: 0,
              bottom: MediaQuery.paddingOf(context).bottom + Space.lg,
              height: 160 + context.scaled(112),
              child: PageView.builder(
                controller: _pages,
                itemCount: list.length,
                onPageChanged: (i) => _select(list, i),
                itemBuilder: (context, i) => Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Space.xs + 2),
                  child: FacilityMiniCard(facility: list[i], raised: true),
                ),
              ),
            ),
          if (results.hasError)
            Positioned(
              left: Space.lg,
              right: Space.lg,
              bottom: 40,
              child: SoftCard(child: ErrorState(error: results.error!, onRetry: () => ref.invalidate(facilitySearchProvider))),
            ),
        ],
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({required this.icon, required this.onTap, this.busy = false});

  final IconData icon;
  final VoidCallback onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(shape: BoxShape.circle, boxShadow: Shadows.floating),
        child: Material(
          color: Palette.surface,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: busy ? null : onTap,
            child: SizedBox(
              width: 48,
              height: 48,
              child: busy
                  ? Center(child: DefaultTextStyle(style: TextStyle(color: Palette.brand), child: LoadingDots()))
                  : Icon(icon, color: Palette.forestInk),
            ),
          ),
        ),
      );
}
