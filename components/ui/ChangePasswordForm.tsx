"use client";

import { useState, useTransition } from "react";
import { changePasswordAction } from "@/app/actions/profile";
import { Lock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { FormField } from "@/components/app/FormField";
import { PasswordInput } from "@/components/app/PasswordInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function ChangePasswordForm({ hasPassword = true }: { hasPassword?: boolean }) {
  const [currentPassword, setCurrentPassword]   = useState("");
  const [newPassword, setNewPassword]           = useState("");
  const [confirmPassword, setConfirmPassword]   = useState("");
  const [error, setError]                       = useState<string | null>(null);
  const [success, setSuccess]                   = useState(false);
  const [isPending, startTransition]            = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await changePasswordAction({
        currentPassword: hasPassword ? currentPassword : "",
        newPassword,
        confirmPassword,
      });

      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      } else {
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast.success(hasPassword ? "Password changed successfully!" : "Password set successfully!");
      }
    });
  };

  // Same thresholds as before: under 8 too short, under 12 acceptable.
  const strength =
    newPassword.length === 0 ? null : newPassword.length < 8 ? "short" : newPassword.length < 12 ? "ok" : "strong";
  const strengthLabel = { short: "Too short", ok: "Acceptable", strong: "Strong" } as const;
  const strengthBar = { short: "bg-red-500", ok: "bg-amber-500", strong: "bg-green-600" } as const;
  const strengthText = { short: "text-tone-red-fg", ok: "text-tone-amber-fg", strong: "text-tone-green-fg" } as const;

  return (
    <Card className="md:[--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[1.1rem] font-bold">
          <Lock aria-hidden="true" className="size-[18px] text-primary" />
          {hasPassword ? "Change Password" : "Set Local Password"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {success && (
          <Alert variant="success">
            <CheckCircle aria-hidden="true" />
            <AlertDescription>Password changed successfully!</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {hasPassword && (
            <FormField label="Current Password" htmlFor="current-password">
              <PasswordInput
                id="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="off"
              />
            </FormField>
          )}

          <FormField label="New Password" htmlFor="new-password">
            <PasswordInput
              id="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="off"
              aria-describedby={strength ? "new-password-strength" : undefined}
            />
            {/* Password strength bar */}
            {strength && (
              <div className="flex flex-col gap-1">
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-all duration-300", strengthBar[strength])}
                    style={{ width: `${Math.min((newPassword.length / 16) * 100, 100)}%` }}
                  />
                </div>
                <span id="new-password-strength" className={cn("text-[0.7rem] font-semibold", strengthText[strength])}>
                  {strengthLabel[strength]}
                </span>
              </div>
            )}
          </FormField>

          <FormField label="Confirm New Password" htmlFor="confirm-password">
            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="off"
              aria-invalid={confirmPassword.length > 0 && newPassword !== confirmPassword ? true : undefined}
            />
            {/* Match indicator */}
            {confirmPassword.length > 0 && (
              <p className={cn("text-xs font-semibold", newPassword === confirmPassword ? "text-tone-green-fg" : "text-tone-red-fg")}>
                {newPassword === confirmPassword ? "✓ Passwords match" : "✗ Passwords do not match"}
              </p>
            )}
          </FormField>

          <Button
            type="submit"
            disabled={isPending || (hasPassword && !currentPassword) || !newPassword || !confirmPassword}
            className="w-full sm:w-auto sm:self-start"
          >
            {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
            {isPending ? "Saving..." : (hasPassword ? "Change Password" : "Set Password")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
