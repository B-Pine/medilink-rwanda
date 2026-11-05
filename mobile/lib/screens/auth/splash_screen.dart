import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../../ui/band.dart';

/// Forest with the zigzag; the MediLink cross draws itself in one stroke, then the name fades in.
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
                final draw = Curves.easeOut.transform((_c.value / 0.75).clamp(0, 1));
                final name = Curves.easeOut.transform(((_c.value - 0.55) / 0.45).clamp(0, 1));
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CrossMark(size: 64, progress: draw),
                    const SizedBox(height: Space.xl),
                    Opacity(
                      opacity: name,
                      child: Text(
                        'MediLink',
                        style: Theme.of(context)
                            .textTheme
                            .headlineMedium
                            ?.copyWith(color: Colors.white, letterSpacing: 0.4),
                      ),
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
