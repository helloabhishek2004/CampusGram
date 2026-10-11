"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@smart-campus/ui";
import { ArrowLeft, Camera, Loader2, X, Lock, AlertTriangle } from "lucide-react";
import { DEMO_IMAGE_TYPES, readDemoImage, serializeDemoReport, validateDemoImageFiles } from "../../_lib/demo-images";
import { readWorkflowResponse } from "../../_lib/workflow-client";

export default function ReportLostItemPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const previews = useRef(new Set<string>());
  useEffect(() => () => { previews.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  const [formData, setFormData] = useState({
    title: "",
    category: "electronics",
    subcategory: "",
    public_description: "",
    identifying_marks: "",
    location_description: "",
    event_date: new Date().toISOString().slice(0, 16),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    e.target.value = "";
    if (!selected.length || isSubmitting) return;
    setFormError(null);
    try {
      validateDemoImageFiles([...files.map(({ file }) => file), ...selected]);
      const additions = selected.map((file) => {
        const preview = URL.createObjectURL(file);
        previews.current.add(preview);
        return { file, preview };
      });
      setFiles((previous) => [...previous, ...additions]);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to select these photos.");
    }
  };

  const removeFile = (index: number) => {
    const removed = files[index];
    if (removed?.preview) { URL.revokeObjectURL(removed.preview); previews.current.delete(removed.preview); }
    setFiles((previous) => previous.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFormError(null);
    setIsSubmitting(true);

    try {
      validateDemoImageFiles(files.map(({ file }) => file));
      const base64Images = await Promise.all(files.map(({ file }) => readDemoImage(file)));
      const body = serializeDemoReport("lost", formData, base64Images);

      const res = await fetch("/api/lost-found/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      const data = await readWorkflowResponse(res);
      if (!data.item?.id) throw new Error("The server did not return a saved report reference.");
      router.push(`/lost-and-found/success?type=lost&id=${data.item.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href="/lost-and-found"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Lost & Found
        </Link>

        <Card className="border-border bg-card shadow-xs rounded-xl">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-border bg-muted text-muted-foreground font-semibold">
                Module 3 Report
              </span>
            </div>
            <CardTitle className="text-lg font-bold text-foreground">
              Report a Lost Item
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Submit details and photos of your missing item to initiate automated multimodal AI matching.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* Form Error Banner */}
              {formError && (
                <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-destructive" />
                  <span>{formError}</span>
                </div>
              )}

              <fieldset disabled={isSubmitting} className="space-y-4">
              {/* Photos */}
              <div className="space-y-2">
                <label className="font-semibold text-foreground">Photos (max 3)</label>

                {files.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {files.map((f, i) => (
                      <div
                        key={i}
                        className="relative w-24 h-24 shrink-0 rounded-lg overflow-hidden border border-border bg-muted"
                      >
                        <Image
                          src={f.preview}
                          alt={f.file?.name ? `Lost item photo preview: ${f.file.name}` : `Lost item photo preview ${i + 1}`}
                          fill
                          unoptimized
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          aria-label={`Remove photo ${i + 1}`}
                          onClick={() => removeFile(i)}
                          className="absolute top-1 right-1 bg-background/80 text-foreground border border-border rounded-full p-1 hover:bg-background"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {files.length < 3 && (
                  <div className="border border-dashed border-border hover:border-primary/50 rounded-lg p-5 flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition cursor-pointer relative">
                    <Camera className="w-6 h-6 mb-1 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">Tap to browse or take photo</span>
                    <span className="text-[10px] text-muted-foreground">JPG, PNG, WebP up to 5MB</span>
                    <input
                      type="file"
                      aria-label="Attach item photos"
                      accept={DEMO_IMAGE_TYPES.join(",")}
                      capture="environment"
                      multiple
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Photos use inline base64 demo storage (not a production upload service). Add only item photos; private identifying details belong in the protected fields below.</p>

              {/* Title */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Item Title <span className="text-destructive">*</span></label>
                <input
                  required
                  type="text"
                  aria-label="Item title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Dell XPS 15 Silver Laptop, Blue Hydro Flask"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Category</label>
                  <select
                    required
                    aria-label="Category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                  >
                    <option value="electronics">Electronics</option>
                    <option value="id_cards_docs">ID Cards / Docs</option>
                    <option value="keys">Keys</option>
                    <option value="wallets_purses">Wallets / Purses</option>
                    <option value="bags_backpacks">Bags / Backpacks</option>
                    <option value="water_bottles">Water Bottles</option>
                    <option value="clothing_accessories">Clothing</option>
                    <option value="books_stationery">Books</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Approximate Date & Time</label>
                  <input
                    required
                    type="datetime-local"
                    aria-label="Approximate date and time"
                    value={formData.event_date}
                    onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                  />
                </div>
              </div>

              {/* Location */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Last Seen Location <span className="text-destructive">*</span></label>
                <input
                  required
                  type="text"
                  aria-label="Last seen location"
                  value={formData.location_description}
                  onChange={(e) => setFormData({ ...formData, location_description: e.target.value })}
                  placeholder="e.g. Central Library Floor 2 study desk, or Canteen table 5"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                />
              </div>

              {/* Public Description */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Public Description</label>
                <textarea
                  required
                  aria-label="Public description"
                  rows={3}
                  value={formData.public_description}
                  onChange={(e) => setFormData({ ...formData, public_description: e.target.value })}
                  placeholder="Describe the item general appearance visible to other students in the directory."
                  className="w-full px-3 py-2 border border-input rounded-lg resize-none bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                />
              </div>

              {/* Identifying Marks (Hidden) */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  <label className="font-semibold text-foreground">Private Identifying Marks (Protected)</label>
                </div>
                <textarea
                  rows={2}
                  aria-label="Private identifying marks"
                  value={formData.identifying_marks}
                  onChange={(e) => setFormData({ ...formData, identifying_marks: e.target.value })}
                  placeholder="Specific stickers, wallpaper, serial suffix, scratches. NEVER shown publicly; used only during claim verification."
                  className="w-full px-3 py-2 border border-border rounded-lg resize-none bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                />
              </div>
              </fieldset>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Submit Lost Report</span>
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
