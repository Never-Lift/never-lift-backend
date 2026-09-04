package com.neverlift.backend.race.physics;

public record Vec2(double x, double y) {
    public static final Vec2 ZERO = new Vec2(0, 0);
    public Vec2 add(Vec2 b) { return new Vec2(x + b.x, y + b.y); }
    public Vec2 sub(Vec2 b) { return new Vec2(x - b.x, y - b.y); }
    public Vec2 scale(double k) { return new Vec2(x * k, y * k); }
    public double dot(Vec2 b) { return x * b.x + y * b.y; }
    public double cross(Vec2 b) { return x * b.y - y * b.x; }
    public double length() { return VehicleIntegrator.scaledHypot(x, y); }
    public Vec2 left() { return new Vec2(-y, x); }
    public Vec2 unit() { double size = length(); return size <= Math.ulp(1.0) ? ZERO : scale(1 / size); }
    public Vec2 rotate(double angle) { return new Vec2(x * PortableMath.cos(angle) - y * PortableMath.sin(angle), x * PortableMath.sin(angle) + y * PortableMath.cos(angle)); }
    public double distanceSquared(Vec2 b) { double dx = x - b.x, dy = y - b.y; return dx * dx + dy * dy; }
}
