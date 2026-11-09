import { SensorGuide } from "@/types/sensorGuide";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { ModalShell } from "@/components/ModalShell";
import { Z_INDEX } from "@/lib/z-index";

interface InstructionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: () => void;
  sensorGuide?: SensorGuide;
}

export default function InstructionModal({
  isOpen,
  onClose,
  onStart,
  sensorGuide,
}: InstructionModalProps) {
  const { isRateLimited } = useRateLimit(1000);
  return (
    <ModalShell
      open={isOpen}
      zIndex={Z_INDEX.MODAL}
      backdrop="blur"
      avoidKeyboard={false}
      shellClassName="items-stretch justify-stretch p-0"
      panelClassName="bg-white shadow-lg p-4 sm:p-6 lg:p-8 w-full h-full max-w-none max-h-none overflow-hidden flex flex-col"
    >
            <h2 className="text-xl sm:text-2xl font-bold mb-4">{sensorGuide?.name}</h2>
            <div className="flex flex-1 min-h-0 items-stretch mb-5">
              {sensorGuide?.image && (
                <img
                  src={sensorGuide.image}
                  alt={sensorGuide.name}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  className="w-full h-full flex-1 min-h-0 max-h-none object-contain select-none [-webkit-user-drag:none]"
                />
              )}
            </div>

            <div className="flex flex-row gap-4 shrink-0">
              <button
                onClick={() => {
                  if (isRateLimited("cancel")) return;
                  onClose();
                }}
                className="flex-1 px-6 py-4 bg-gray-200 rounded-lg hover:bg-gray-300 font-semibold text-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (isRateLimited("start")) return;
                  onStart();
                }}
                className="flex-1 px-6 py-4 bg-primary text-white rounded-lg hover:bg-primary-dark font-semibold text-lg"
              >
                Start
              </button>
            </div>
    </ModalShell>
  );
}
