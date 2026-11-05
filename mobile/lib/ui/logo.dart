import 'package:flutter/material.dart';

/// The MediLink logo (brand/logo/source/logo-horizontal-raw.png, cut into assets/brand/).
/// On the forest band the pin sits on a white badge, like the launcher icon, so its dark half
/// stays visible.
class BrandBadge extends StatelessWidget {
  const BrandBadge({super.key, this.size = 56});

  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'MediLink Rwanda',
        image: true,
        child: Container(
          width: size,
          height: size,
          padding: EdgeInsets.all(size * 0.17),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(size * 0.26),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: size * 0.3, offset: Offset(0, size * 0.06))],
          ),
          child: Image.asset('assets/brand/symbol.png', fit: BoxFit.contain, filterQuality: FilterQuality.medium),
        ),
      );
}

/// "MediLink RWANDA" in white, for the forest band.
class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.height = 36});

  final double height;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Image.asset('assets/brand/wordmark-white.png', height: height, filterQuality: FilterQuality.medium),
      );
}

/// The full colour logo, for light surfaces.
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.height = 40});

  final double height;

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'MediLink Rwanda',
        image: true,
        child: Image.asset('assets/brand/logo.png', height: height, filterQuality: FilterQuality.medium),
      );
}
