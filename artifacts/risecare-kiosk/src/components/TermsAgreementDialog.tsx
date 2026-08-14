import { useState } from "react";
import { Check, FileText, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TermsAgreementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAgree: () => void;
}

export default function TermsAgreementDialog({
  open,
  onOpenChange,
  onAgree,
}: TermsAgreementDialogProps) {
  const [agreed, setAgreed] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) setAgreed(false);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl rounded-2xl p-0 overflow-hidden gap-0 max-h-[90vh] flex flex-col">
        <DialogHeader className="p-6 pb-4 text-center sm:text-center border-b border-border/50 bg-secondary/30 shrink-0">
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <FileText className="w-6 h-6" />
            </div>
          </div>
          <DialogTitle className="text-2xl font-bold font-display">
            Terms &amp; Conditions
          </DialogTitle>
          <DialogDescription className="text-lg">
            Please read and accept the terms below before proceeding
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[50vh] min-h-0 px-6 py-4">
          <div className="space-y-4 text-lg leading-relaxed text-foreground">
            <p>
              By using the RISECARE health kiosk, you agree to the following:
            </p>

            <ol className="list-decimal pl-6 space-y-3">
              <li>
                <span className="font-semibold">Consent to Measurement</span>{" "}
                You consent to the automated measurement of your vital signs
                (heart rate, blood pressure, oxygen saturation, temperature,
                height, and weight) using the kiosk equipment.
              </li>
              <li>
                <span className="font-semibold">Personal Information</span>{" "}
                The personal information you provide (name, phone number, age,
                and sex) will be used solely to identify and deliver your
                measurement results.
              </li>
              <li>
                <span className="font-semibold">Data Privacy</span> Your
                personal information and vital sign data will be stored securely
                and will only be accessed by authorized healthcare personnel.
                It will not be shared with third parties except as required by
                law.
              </li>
              <li>
                <span className="font-semibold">Not a Medical Diagnosis</span>{" "}
                The results provided by this kiosk are for informational and
                monitoring purposes only. They do not replace a professional
                medical evaluation. Always consult a qualified healthcare
                provider for medical advice.
              </li>
              <li>
                <span className="font-semibold">Voluntary Participation</span>{" "}
                Your participation is voluntary. You may decline to use the
                kiosk at any time, and you may discontinue a measurement
                session whenever you wish.
              </li>
              <li>
                <span className="font-semibold">Age Restriction</span> Minors
                must be accompanied by a parent or legal guardian when using
                the kiosk.
              </li>
            </ol>
          </div>
        </ScrollArea>

        <div className="p-6 pt-4 border-t border-border/50 shrink-0">
          <label
            className="flex items-start gap-3 cursor-pointer select-none mb-4"
            onClick={(e) => e.preventDefault()}
          >
            <Checkbox
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              className="mt-1 h-6 w-6 rounded-md"
            />
            <span className="text-lg leading-snug text-foreground">
              I have read and agree to the Terms &amp; Conditions and consent
              to the collection and processing of my information.
            </span>
          </label>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              onClick={() => handleOpenChange(false)}
              className="h-12 px-6 text-lg font-bold bg-secondary text-foreground rounded-lg border border-border hover:bg-secondary/70 flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" /> Decline
            </button>
            <button
              onClick={() => {
                if (!agreed) return;
                setAgreed(false);
                onAgree();
              }}
              disabled={!agreed}
              className="h-12 px-6 text-lg font-bold bg-primary text-primary-foreground rounded-lg shadow-xl shadow-primary/25 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" /> Agree &amp; Continue
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
