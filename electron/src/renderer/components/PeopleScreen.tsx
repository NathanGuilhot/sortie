import { useState, useEffect, useRef } from 'react';
import { usePeopleStore } from '../stores/peopleStore';
import { Person, Face, Image } from 'shared';
import { buildFaceThumbUrl } from './faceThumb';
import { MetadataModal } from './MetadataModal';
import {
  ScreenShell,
  StatHeader,
  EmptyState,
  ProgressPanel,
  PrimaryButton,
  CancelButton,
} from './screen';
import { toast } from '../stores/toastStore';

const SearchIcon = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const PeopleIcon = (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
    />
  </svg>
);

function PersonCard({
  person,
  isSelected,
  onClick,
  onMergeTarget,
  merging,
}: {
  person: Person;
  isSelected: boolean;
  onClick: () => void;
  onMergeTarget?: () => void;
  merging: boolean;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!person.thumbnail_face_id) return;
    let cancelled = false;
    window.sortieAPI
      .getPersonImages(person.id, 1)
      .then(async (images) => {
        if (cancelled || images.length === 0) return;
        const faces = await window.sortieAPI.getImageFaces(images[0].id);
        const personFace = faces.find((f) => f.person_id === person.id);
        if (!cancelled && personFace) setThumbUrl(buildFaceThumbUrl(personFace));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to load face thumbnail: ${message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [person.id, person.thumbnail_face_id]);

  return (
    <button
      onClick={merging ? onMergeTarget : onClick}
      className={`flex flex-col items-center p-4 rounded-xl transition-all ${
        isSelected
          ? 'bg-lavender/30 ring-2 ring-ink/40'
          : merging
            ? 'bg-lavender/30 ring-2 ring-ink/20 hover:bg-lavender/50 cursor-crosshair'
            : 'bg-white hover:bg-gray-50 hover:shadow-md'
      } border border-gray-200`}
    >
      <div className="w-20 h-20 rounded-full bg-gray-200 overflow-hidden mb-3 flex-shrink-0">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={person.name || 'Unknown'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
        )}
      </div>
      <span className="text-sm font-medium text-gray-800 truncate max-w-full">
        {person.name || `Person ${person.id}`}
      </span>
      <span className="text-xs text-gray-400 mt-0.5">
        {person.face_count} {person.face_count === 1 ? 'photo' : 'photos'}
      </span>
    </button>
  );
}

function PersonDetail({
  person,
  onClose,
  onStartMerge,
}: {
  person: Person;
  onClose: () => void;
  onStartMerge: () => void;
}) {
  const { personImages, renamePerson, deletePerson, fetchPersonImages } = usePeopleStore();
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(person.name || '');
  const [faces, setFaces] = useState<Face[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedImage, setSelectedImage] = useState<Image | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedImage && !personImages.some((i) => i.id === selectedImage.id)) {
      setSelectedImage(null);
    }
  }, [personImages, selectedImage]);

  /* eslint-disable react-hooks/set-state-in-effect -- intentional reset on prop change */
  useEffect(() => {
    setNameInput(person.name || '');
    setConfirmDelete(false);
    void fetchPersonImages(person.id);
  }, [person.id, person.name, fetchPersonImages]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Load faces for all person images
  useEffect(() => {
    const loadFaces = async () => {
      const allFaces: Face[] = [];
      for (const img of personImages) {
        const imgFaces = await window.sortieAPI.getImageFaces(img.id);
        allFaces.push(...imgFaces.filter((f) => f.person_id === person.id));
      }
      setFaces(allFaces);
    };
    if (personImages.length > 0) void loadFaces();
  }, [personImages, person.id]);

  const handleSaveName = async () => {
    if (nameInput.trim()) {
      await renamePerson(person.id, nameInput.trim());
    }
    setEditing(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSaveName();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={nameRef}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={() => void handleSaveName()}
                autoFocus
                className="text-xl font-semibold border-b-2 border-ink outline-none bg-transparent px-1"
              />
            </form>
          ) : (
            <h2
              className="text-xl font-semibold cursor-pointer hover:text-ink"
              onClick={() => setEditing(true)}
            >
              {person.name || `Person ${person.id}`}
            </h2>
          )}
          <span className="text-sm text-gray-400">
            {person.face_count} {person.face_count === 1 ? 'photo' : 'photos'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onStartMerge}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Merge
          </button>
          {confirmDelete ? (
            <button
              onClick={() => {
                void deletePerson(person.id).then(onClose);
              }}
              className="px-3 py-1.5 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors"
            >
              Confirm Delete
            </button>
          ) : (
            <button
              onClick={() => { setConfirmDelete(true); }}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Face thumbnails */}
      {faces.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Detected Faces</h3>
          <div className="flex flex-wrap gap-3">
            {faces.map((face) => (
              <FaceThumbnail key={face.id} face={face} />
            ))}
          </div>
        </div>
      )}

      {/* Image grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {personImages.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setSelectedImage(img)}
            className="aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity"
          >
            <img
              src={`sortie-thumb://${img.file_path}?w=300`}
              alt={img.file_name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {selectedImage && (
        <MetadataModal
          image={selectedImage}
          images={personImages}
          onClose={() => setSelectedImage(null)}
          onNavigate={(img) => setSelectedImage(img)}
        />
      )}
    </div>
  );
}

function FaceThumbnail({ face }: { face: Face }) {
  const { splitFace } = usePeopleStore();
  const [hover, setHover] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-200">
        <img
          src={buildFaceThumbUrl(face, 100)}
          alt="face"
          className="w-full h-full object-cover"
        />
      </div>
      {hover && (
        <button
          onClick={() => void splitFace(face.id)}
          className="absolute -top-1.5 -right-1.5 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
          title="Split from this person"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

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
            <PrimaryButton icon={SearchIcon} onClick={() => void scanFaces()}>
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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

        {/* Content */}
        {selectedPerson && !merging ? (
          <PersonDetail
            person={selectedPerson}
            onClose={() => selectPerson(null)}
            onStartMerge={() => setMerging(selectedPerson.id)}
          />
        ) : (
          <>
            {loading && persons.length === 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center p-4 rounded-xl border border-gray-200 animate-pulse">
                    <div className="w-20 h-20 rounded-full bg-gray-200 mb-3" />
                    <div className="h-3 w-16 bg-gray-200 rounded mb-1.5" />
                    <div className="h-2.5 w-10 bg-gray-100 rounded" />
                  </div>
                ))}
              </div>
            ) : persons.length === 0 ? (
              <EmptyState
                icon={PeopleIcon}
                title="No people yet"
                description="Scan your library to detect faces."
                action={
                  <PrimaryButton
                    icon={SearchIcon}
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
                  <PersonCard
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
              <span className="text-sm text-red-600">Erase all face data? This cannot be undone.</span>
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
