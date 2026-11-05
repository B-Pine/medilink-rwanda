import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../../ui/band.dart';
import '../../ui/logo.dart';

/// Forest with the zigzag; the MediLink badge settles in (same as the launch screen), then the
/// wordmark rises in under it.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 650))..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return Scaffold(
      backgroundColor: Palette.forest,
      body: Stack(
        children: [
          ForestBand(height: size.height, curve: 0),
          Center(
            child: AnimatedBuilder(
              animation: _c,
              builder: (context, _) {
                final badge = Curves.easeOutBack.transform((_c.value / 0.6).clamp(0, 1));
                final name = Curves.easeOut.transform(((_c.value - 0.45) / 0.55).clamp(0, 1));
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Transform.scale(scale: 0.9 + 0.1 * badge, child: const BrandBadge(size: 96)),
                    const SizedBox(height: Space.xl),
                    Opacity(
                      opacity: name,
                      child: Transform.translate(offset: Offset(0, 10 * (1 - name)), child: const Wordmark(height: 40)),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
