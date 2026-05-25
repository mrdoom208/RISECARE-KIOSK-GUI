import { SensorGuide } from "@/types/sensorGuide";

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
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-lg p-6 w-[70vw] max-h-[90vh] overflow-y-auto"
          >
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

            <div className="flex flex-row gap-4">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-4 bg-gray-200 rounded-lg hover:bg-gray-300 font-semibold text-lg"
              >
                Cancel
              </button>
              <button
                onClick={onStart}
                className="flex-1 px-6 py-4 bg-primary text-white rounded-lg hover:bg-primary-dark font-semibold text-lg"
              >
                Start
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
