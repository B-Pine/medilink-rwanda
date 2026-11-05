import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../../ui/band.dart';

/// Sign-in and sign-up: a forest band with the cross and the title, a white form below.
class AuthLayout extends StatelessWidget {
  const AuthLayout({super.key, required this.title, required this.children, this.leading});

  final String title;
  final List<Widget> children;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Scaffold(
      backgroundColor: Palette.page,
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Stack(
              children: [
                ForestBand(height: 220 + top),
                Positioned(
                  left: Space.xl,
                  right: Space.xl,
                  top: top + Space.lg,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(height: 40, child: leading),
                      const SizedBox(height: Space.lg),
                      const CrossMark(size: 40),
                      const SizedBox(height: Space.lg),
                      Text(
                        title,
                        style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: Colors.white),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.xl, Space.lg, Space.xl, Space.xxl),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
            ),
          ],
        ),
      ),
    );
  }
}
