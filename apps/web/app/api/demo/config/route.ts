import { NextResponse } from "next/server";
import { getDemoConfiguration } from "../../../../lib/demo/demo-mode";

export async function GET() {
  const config = getDemoConfiguration();
  return NextResponse.json({
    success: true,
    ...config,
  });
}
