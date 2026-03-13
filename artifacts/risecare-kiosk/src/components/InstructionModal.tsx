import { SensorGuide } from "@/types/sensorGuide";

interface InstructionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (value: string, secondaryValue?: string) => void;
  sensorGuide?: SensorGuide;
}

export default function InstructionModal({
  isOpen,
  onClose,
  onSave,
  sensorGuide,
}: InstructionModalProps) {
  if (!isOpen) return null;

  const handleSave = () => {
    onSave("", ""); // Start session without values
    setTimeout(() => {
      onClose();
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-lg p-6 w-[70vw] max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">{sensorGuide?.name}</h2>
        <div className="lg:flex-row flex flex-col-reverse flex-col gap-3 justify-center items-stretch mb-6">
          <div className="flex-1 border border-border rounded-lg p-4">
            {sensorGuide?.instruction && (
              <div>
                <h1 className="text-lg md:text-2xl font-semibold mb-2">
                  How to use
                </h1>
                <div
                  className="lg:text-base text-muted-foreground mb-4 text-sm wrap-text"
                  dangerouslySetInnerHTML={{ __html: sensorGuide.instruction }}
                />
              </div>
            )}

            {sensorGuide?.avoid && (
              <div>
                <h1 className="text-lg md:text-2xl font-semibold mb-2 text-red-600">
                  Things to avoid
                </h1>
                <div
                  className="lg:text-base text-red-600 mb-6 text-sm wrap-text"
                  dangerouslySetInnerHTML={{ __html: sensorGuide.avoid }}
                />
              </div>
            )}
          </div>

          {sensorGuide?.image && (
            <img
              src={sensorGuide.image}
              alt={sensorGuide.name}
              className="flex-1 lg:h-120 object-fit border rounded-md"
            />
          )}
        </div>

        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition"
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
