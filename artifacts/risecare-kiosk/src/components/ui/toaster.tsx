import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

const DEFAULT_TOAST_DURATION = 5000

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={DEFAULT_TOAST_DURATION}>
      {toasts.map(function ({
        id,
        title,
        description,
        action,
        variant,
        duration,
        ...props
      }) {
        const toastDuration = duration ?? DEFAULT_TOAST_DURATION
        const destructive = variant === "destructive"
        return (
          <Toast
            key={id}
            variant={variant}
            duration={toastDuration}
            {...props}
          >
            <div
              className={`absolute left-0 top-0 h-1 w-full ${
                destructive ? "bg-white/20" : "bg-primary/20"
              }`}
            >
              <div
                className={`h-full origin-left ${
                  destructive ? "bg-white" : "bg-primary"
                }`}
                style={{
                  animation: `toast-timer ${toastDuration}ms linear forwards`,
                }}
              />
            </div>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
