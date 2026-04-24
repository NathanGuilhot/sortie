import { useEffect, useState } from 'react';
import { usePeopleStore } from '../stores/peopleStore';
import type { Person } from 'shared';
import {
  ScreenShell,
  StatHeader,
  EmptyState,
  ProgressPanel,
  PrimaryButton,
  CancelButton,
} from './screen';
import { SearchIcon, PeopleIcon as PeopleIconSvg, PersonIcon, ChevronLeftIcon, XIcon } from './icons';
import { PeoplePersonCard } from './PeoplePersonCard';
import { PeoplePersonDetail } from './PeoplePersonDetail';

const peopleIconNode = <PeopleIconSvg className="w-8 h-8" strokeWidth={1.5} />;

export function PeopleScreen() {
  const {
    persons,
    selectedPerson,
    loading,
    scanning,
    scanProgress,
    scanResult,
    fetchPersons,
    selectPerson,
    scanFaces,
    cancelScan,
    mergePersons,
    clearScanResult,
    resetFaceData,
  } = usePeopleStore();

  const [merging, setMerging] = useState<number | null>(null);
  const [resettingFaces, setResettingFaces] = useState(false);

  const handleResetFaceData = async () => {
    if (!resettingFaces) {
      setResettingFaces(true);
      return;
    }
    await resetFaceData();
    setResettingFaces(false);
  };

  useEffect(() => {
    void fetchPersons();
  }, [fetchPersons]);

  const totalFaces = persons.reduce((sum, p) => sum + p.face_count, 0);

  const handleMergeTarget = async (targetPersonId: number) => {
    if (merging && merging !== targetPersonId) {
      await mergePersons(targetPersonId, merging);
      setMerging(null);
    }
  };

  return (
    <ScreenShell>
      <StatHeader
        stats={[
          { value: persons.length, label: 'People' },
          { value: totalFaces.toLocaleString(), label: 'Faces Detected' },
        ]}
        action={
          scanning ? (
            <CancelButton onClick={() => void cancelScan()}>Cancel Scan</CancelButton>
          ) : (
            <PrimaryButton icon={<SearchIcon />} onClick={() => void scanFaces()}>
              Scan Faces
            </PrimaryButton>
          )
        }
      />

      {merging && (
        <div className="mb-6 p-4 bg-lavender/30 border border-lavender/50 rounded-lg flex items-center justify-between">
          <span className="text-sm text-ink">Click another person to merge into them</span>
          <button
            onClick={() => setMerging(null)}
            className="text-sm text-ink hover:text-ink/70 font-medium"
          >
            Cancel
          </button>
        </div>
      )}

      {scanning && scanProgress && (
        <ProgressPanel
          label={scanProgress.total > 0 ? 'Detecting faces...' : 'Checking for unscanned images...'}
          current={scanProgress.current}
          total={scanProgress.total}
          currentFile={scanProgress.currentFile}
        />
      )}

      {scanResult && !scanning && (
        <div className="mb-6 p-4 bg-mint/20 border border-mint/40 rounded-lg flex items-center justify-between">
          <span className="text-sm text-ink">
            {scanResult.scanned === 0
              ? 'All images have already been scanned for faces.'
              : `Scanned ${scanResult.scanned} ${scanResult.scanned === 1 ? 'image' : 'images'}, detected ${scanResult.detected} ${scanResult.detected === 1 ? 'face' : 'faces'}.`}
          </span>
          <button
            onClick={clearScanResult}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-mint/30 text-ink/60 hover:text-ink cursor-pointer"
          >
            <XIcon />
          </button>
        </div>
      )}

      {/* Content */}
      {selectedPerson && !merging ? (
        <PeoplePersonDetail
          person={selectedPerson}
          onClose={() => selectPerson(null)}
          onStartMerge={() => setMerging(selectedPerson.id)}
        />
      ) : (
        <>
          {loading && persons.length === 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center p-4 rounded-xl border border-gray-200 animate-pulse"
                >
                  <div className="w-20 h-20 rounded-full bg-gray-200 mb-3" />
                  <div className="h-3 w-16 bg-gray-200 rounded mb-1.5" />
                  <div className="h-2.5 w-10 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : persons.length === 0 ? (
            <EmptyState
              icon={peopleIconNode}
              title="No people yet"
              description="Scan your library to detect faces."
              action={
                <PrimaryButton
                  icon={<SearchIcon />}
                  size="lg"
                  onClick={() => void scanFaces()}
                  disabled={scanning}
                >
                  Scan Faces
                </PrimaryButton>
              }
            />
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
              {persons.map((person) => (
                <PeoplePersonCard
                  key={person.id}
                  person={person}
                  isSelected={selectedPerson?.id === person.id}
                  onClick={() => selectPerson(person)}
                  onMergeTarget={() => void handleMergeTarget(person.id)}
                  merging={merging !== null && merging !== person.id}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Reset face data */}
      <div className="mt-12 pt-4 border-t border-gray-100 flex justify-center">
        {resettingFaces ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-red-600">
              Erase all face data? This cannot be undone.
            </span>
            <button
              onClick={() => void handleResetFaceData()}
              className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer"
            >
              Confirm Reset
            </button>
            <button
              onClick={() => setResettingFaces(false)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => void handleResetFaceData()}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
          >
            Reset Face Data
          </button>
        )}
      </div>
    </ScreenShell>
  );
}
