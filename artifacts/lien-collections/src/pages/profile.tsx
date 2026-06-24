import * as React from "react";
import { Screen } from "@/components/primitives/Screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth, refreshAuth, type AuthUser } from "@workspace/replit-auth-web";
import { useTheme, type Theme } from "@/lib/theme";
import {
  User as UserIcon,
  Mail,
  ShieldCheck,
  Camera,
  Trash2,
  Loader2,
  Sun,
  Moon,
  Monitor,
  Check,
} from "lucide-react";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Español (Spanish)" },
  { value: "fr", label: "Français (French)" },
  { value: "de", label: "Deutsch (German)" },
  { value: "pt", label: "Português (Portuguese)" },
  { value: "zh", label: "中文 (Chinese)" },
];

const CURRENCIES = [
  { value: "USD", label: "USD — US Dollar ($)" },
  { value: "CAD", label: "CAD — Canadian Dollar ($)" },
  { value: "EUR", label: "EUR — Euro (€)" },
  { value: "GBP", label: "GBP — British Pound (£)" },
  { value: "MXN", label: "MXN — Mexican Peso ($)" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  pm: "Project Manager",
  finance: "Finance",
  coordinator: "Coordinator",
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function initials(u: AuthUser): string {
  const f = u.firstName?.trim()?.[0] ?? "";
  const l = u.lastName?.trim()?.[0] ?? "";
  const i = `${f}${l}`.toUpperCase();
  if (i) return i;
  return (u.displayName?.trim()?.[0] ?? u.email?.trim()?.[0] ?? "?").toUpperCase();
}

// ---------------------------------------------------------------------------
// Section shell
// ---------------------------------------------------------------------------

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl border"
      style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}
    >
      <div
        className="border-b px-5 py-4"
        style={{ borderColor: "var(--helm-border)" }}
      >
        <h2
          className="text-[15px] font-semibold"
          style={{ color: "var(--text-base)" }}
        >
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-dim)" }}>
            {description}
          </p>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ReadOnlyField({
  label,
  value,
  Icon,
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div>
      <Label className="text-[12.5px]" style={{ color: "var(--text-dim)" }}>
        {label}
      </Label>
      <div
        className="mt-1.5 flex items-center gap-2 rounded-md border px-3 py-2.5 text-[13.5px]"
        style={{
          background: "var(--surface-2)",
          borderColor: "var(--helm-border)",
          color: "var(--text-base)",
        }}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [displayName, setDisplayName] = React.useState("");
  const [language, setLanguage] = React.useState("en");
  const [currency, setCurrency] = React.useState("USD");
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [savingPrefs, setSavingPrefs] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Seed form state once the user loads (and whenever identity changes).
  React.useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? "");
    setLanguage(user.language ?? "en");
    setCurrency(user.currency ?? "USD");
  }, [user?.id, user?.displayName, user?.language, user?.currency]);

  if (isLoading) {
    return (
      <Screen maxWidth="lg">
        <div
          className="flex h-40 items-center justify-center text-[13.5px]"
          style={{ color: "var(--text-dim)" }}
        >
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading profile…
        </div>
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen maxWidth="lg">
        <div className="text-[13.5px]" style={{ color: "var(--text-dim)" }}>
          You must be signed in to view your profile.
        </div>
      </Screen>
    );
  }

  const nameChanged = displayName.trim() !== (user.displayName ?? "").trim();
  const prefsChanged =
    language !== (user.language ?? "en") || currency !== (user.currency ?? "USD");

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await apiFetch("/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: displayName.trim() || null }),
      });
      refreshAuth();
      toast({ title: "Profile updated", description: "Your display name was saved." });
    } catch (err) {
      toast({
        title: "Could not save profile",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePrefs() {
    setSavingPrefs(true);
    try {
      await apiFetch("/profile", {
        method: "PATCH",
        body: JSON.stringify({ language, currency }),
      });
      refreshAuth();
      toast({ title: "Preferences saved", description: "Your preferences were updated." });
    } catch (err) {
      toast({
        title: "Could not save preferences",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingPrefs(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please choose an image.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast({ title: "Image too large", description: "Maximum size is 5 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      // 1. Ask the server for a presigned upload URL.
      const { uploadURL, objectPath } = await apiFetch<{
        uploadURL: string;
        objectPath: string;
      }>("/storage/uploads/request-url", {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });
      // 2. Upload the bytes directly to storage.
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed (HTTP ${putRes.status})`);
      // 3. Attach the uploaded object as the avatar.
      await apiFetch("/profile/avatar", {
        method: "PUT",
        body: JSON.stringify({ avatarUrl: objectPath }),
      });
      refreshAuth();
      toast({ title: "Photo updated", description: "Your profile photo was saved." });
    } catch (err) {
      toast({
        title: "Could not upload photo",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      await apiFetch("/profile/avatar", { method: "DELETE" });
      refreshAuth();
      toast({ title: "Photo removed", description: "Your uploaded photo was removed." });
    } catch (err) {
      toast({
        title: "Could not remove photo",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  const themeOptions: { value: Theme; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: Monitor },
  ];

  return (
    <Screen maxWidth="lg">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <div>
          <h1
            className="text-[20px] font-bold tracking-tight"
            style={{ color: "var(--text-base)" }}
          >
            My Profile
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-dim)" }}>
            Manage your personal details, photo, and workspace preferences.
          </p>
        </div>

        {/* Identity + avatar */}
        <Section
          title="Account"
          description="Your photo and display name appear across LiensEasy."
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName ?? "Avatar"}
                  className="h-24 w-24 rounded-full object-cover"
                  style={{ border: "2px solid var(--helm-border)" }}
                />
              ) : (
                <div
                  className="flex h-24 w-24 items-center justify-center rounded-full text-[30px] font-bold text-[#1a1205]"
                  style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}
                >
                  {initials(user)}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickFile}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                  {user.hasCustomAvatar ? "Change" : "Upload"}
                </Button>
                {user.hasCustomAvatar && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploading}
                    onClick={removeAvatar}
                    title="Remove uploaded photo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p
                className="max-w-[160px] text-center text-[11px]"
                style={{ color: "var(--text-muted-color)" }}
              >
                JPG, PNG or GIF. Max 5 MB.
              </p>
            </div>

            {/* Fields */}
            <div className="flex flex-1 flex-col gap-4">
              <div>
                <Label
                  htmlFor="displayName"
                  className="text-[12.5px]"
                  style={{ color: "var(--text-dim)" }}
                >
                  Display name
                </Label>
                <Input
                  id="displayName"
                  value={displayName}
                  maxLength={120}
                  placeholder="How your name appears in the app"
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ReadOnlyField label="Email" value={user.email ?? "—"} Icon={Mail} />
                <ReadOnlyField
                  label="Role"
                  value={user.role ? (ROLE_LABELS[user.role] ?? user.role) : "Not assigned"}
                  Icon={user.role ? ShieldCheck : UserIcon}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={saveProfile}
                  disabled={!nameChanged || savingProfile}
                >
                  {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </div>
          </div>
        </Section>

        {/* Preferences */}
        <Section
          title="Preferences"
          description="Theme applies instantly. Language and currency are saved to your account."
        >
          <div className="flex flex-col gap-5">
            {/* Theme */}
            <div>
              <Label className="text-[12.5px]" style={{ color: "var(--text-dim)" }}>
                Theme
              </Label>
              <div className="mt-2 grid grid-cols-3 gap-2.5">
                {themeOptions.map(({ value, label, Icon }) => {
                  const active = theme === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTheme(value)}
                      className="relative flex flex-col items-center gap-2 rounded-lg border px-3 py-4 transition-colors"
                      style={{
                        background: active ? "var(--surface-3)" : "var(--surface-2)",
                        borderColor: active ? "#f59e0b" : "var(--helm-border)",
                        color: active ? "var(--text-base)" : "var(--text-dim)",
                      }}
                    >
                      {active && (
                        <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-amber-500" />
                      )}
                      <Icon className="h-5 w-5" />
                      <span className="text-[12.5px] font-medium">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Language + currency */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-[12.5px]" style={{ color: "var(--text-dim)" }}>
                  Language
                </Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[12.5px]" style={{ color: "var(--text-dim)" }}>
                  Currency
                </Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={savePrefs}
                disabled={!prefsChanged || savingPrefs}
              >
                {savingPrefs && <Loader2 className="h-4 w-4 animate-spin" />}
                Save preferences
              </Button>
            </div>
          </div>
        </Section>
      </div>
    </Screen>
  );
}
