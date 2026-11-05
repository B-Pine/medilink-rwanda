import 'package:flutter/material.dart';

import '../app/theme.dart';
import 'band.dart';

/// The short forest band behind a tab's title (Care, Visits, Me), with optional content below
/// the title (search, filters, profile).
class BandHeader extends StatelessWidget {
  const BandHeader({super.key, required this.title, this.bottom, this.trailing, this.leading, this.height = 120});

  final String title;
  final Widget? bottom;
  final Widget? trailing;
  final Widget? leading;
  final double height;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Stack(
      children: [
        Positioned.fill(child: ForestBand(height: height + top, curve: 18)),
        Padding(
          padding: EdgeInsets.fromLTRB(Space.lg, top + Space.md, Space.lg, Space.xl + Space.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  if (leading != null) leading! else const SizedBox(width: Space.sm),
                  Expanded(
                    child: Text(
                      title,
                      style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: Colors.white),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  ?trailing,
                ],
              ),
              if (bottom != null) ...[const SizedBox(height: Space.md), bottom!],
            ],
          ),
        ),
      ],
    );
  }
}

/// A white back arrow for screens under a band.
class BandBack extends StatelessWidget {
  const BandBack({super.key});

  @override
  Widget build(BuildContext context) => IconButton(
        onPressed: () => Navigator.of(context).maybePop(),
        icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
      );
}
