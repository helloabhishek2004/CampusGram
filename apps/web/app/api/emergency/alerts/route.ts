import { NextRequest, NextResponse } from "next/server";
import { emergencyService } from "@/lib/emergency/emergency-service";
import { CreateEmergencyAlertInputSchema } from "@smart-campus/contracts";
import { resolveServerIdentity } from "@/lib/auth/server-identity";
import { canCreateEmergencyBroadcast, canViewEmergencyAlert } from "@/lib/emergency/emergency-permissions";

export async function GET() {
  try {
    const identity = await resolveServerIdentity({ allowDemo: true });
    if (!identity) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

    const { alerts, active } = await emergencyService.getAlertData();
    const hotlines = emergencyService.getHotlines();

    // Filter alerts so they are only visible to their selected audience
    const visibleAlerts = alerts.filter((alert) =>
      canViewEmergencyAlert(alert.scope, identity.profile)
    );
    const visibleActive = active.filter((alert) =>
      canViewEmergencyAlert(alert.scope, identity.profile)
    );

    return NextResponse.json({
      success: true,
      alerts: visibleAlerts,
      active: visibleActive,
      hotlines,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = await resolveServerIdentity({ allowDemo: true });
    if (!identity) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    const authorized = canCreateEmergencyBroadcast(identity.profile);
    if (!authorized) return NextResponse.json({ success: false, error: "Broadcast authorization required" }, { status: 403 });
    const json = await req.json();
    const parsed = CreateEmergencyAlertInputSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const alert = await emergencyService.broadcastAlert(parsed.data, {
      userId: identity.userId,
      fullName: identity.profile?.fullName || "Authorized Campus Responder",
      profileId: identity.userId,
    });

    return NextResponse.json({
      success: true,
      message: `Broadcast recorded in CampusGram. External delivery is simulated; channels requested: ${parsed.data.channels.join(", ").toUpperCase()}.`,
      alert,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
