import { useState, useEffect, useRef } from 'react';
import { usePeopleStore } from '../stores/peopleStore';
import { Person, Face } from 'shared';

function buildFaceThumbUrl(face: Face, size: number = 200): string {
  const params = new URLSearchParams({
    path: face.image_path || '',
    x: String(face.bbox_x),
    y: String(face.bbox_y),
    w: String(face.bbox_w),
    h: String(face.bbox_h),
    size: String(size),
  });
  return `sortie-face://${face.id}?${params.toString()}`;
}

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
    if (person.thumbnail_face_id) {
      window.sortieAPI.getImageFaces(0).catch(() => {});
      // Load the actual face for this person
      window.sortieAPI
        .getPersonImages(person.id, 1)
        .then(async (images) => {
          if (images.length > 0) {
            const faces = await window.sortieAPI.getImageFaces(images[0].id);
            const personFace = faces.find((f) => f.person_id === person.id);
            if (personFace) {
              setThumbUrl(buildFaceThumbUrl(personFace));
            }
          }
        })
        .catch(() => {});
    }
  }, [person.id, person.thumbnail_face_id]);

  return (
    <button
      onClick={merging ? onMergeTarget : onClick}
      className={`flex flex-col items-center p-4 rounded-xl transition-all ${
        isSelected
          ? 'bg-blue-50 ring-2 ring-blue-500'
          : merging
            ? 'bg-blue-50 ring-2 ring-blue-300 hover:bg-blue-100 cursor-crosshair'
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
  const nameRef = useRef<HTMLInputElement>(null);

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
                className="text-xl font-semibold border-b-2 border-blue-500 outline-none bg-transparent px-1"
              />
            </form>
          ) : (
            <h2
              className="text-xl font-semibold cursor-pointer hover:text-blue-600"
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
          <div key={img.id} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
            <img
              src={`sortie-thumb://${img.file_path}?w=300`}
              alt={img.file_name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
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
    error,
    scanning,
    scanProgress,
    scanResult,
    fetchPersons,
    selectPerson,
    scanFaces,
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
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">People</h1>
            <p className="text-sm text-gray-500 mt-1">
              {persons.length} {persons.length === 1 ? 'person' : 'people'} &middot; {totalFaces}{' '}
              {totalFaces === 1 ? 'face' : 'faces'} detected
            </p>
          </div>
          <button
            onClick={() => void scanFaces()}
            disabled={scanning}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              scanning
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {scanning ? 'Scanning...' : 'Scan Faces'}
          </button>
        </div>

        {/* Merge banner */}
        {merging && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <span className="text-sm text-blue-800">
              Click another person to merge into them
            </span>
            <button
              onClick={() => setMerging(null)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Scan progress */}
        {scanning && scanProgress && (
          <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
            {scanProgress.total > 0 ? (
              <>
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Detecting faces...</span>
                  <span>
                    {scanProgress.current} / {scanProgress.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2 truncate">{scanProgress.currentFile}</p>
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking for unscanned images...
              </div>
            )}
          </div>
        )}

        {/* Scan result */}
        {scanResult && !scanning && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <span className="text-sm text-blue-800">
              {scanResult.scanned === 0
                ? 'All images have already been scanned for faces.'
                : `Scanned ${scanResult.scanned} ${scanResult.scanned === 1 ? 'image' : 'images'}, detected ${scanResult.detected} ${scanResult.detected === 1 ? 'face' : 'faces'}.`}
            </span>
            <button
              onClick={clearScanResult}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-blue-100 text-blue-400 hover:text-blue-600 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
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
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center p-4 rounded-xl border border-gray-200 animate-pulse">
                    <div className="w-20 h-20 rounded-full bg-gray-200 mb-3" />
                    <div className="h-3 w-16 bg-gray-200 rounded mb-1.5" />
                    <div className="h-2.5 w-10 bg-gray-100 rounded" />
                  </div>
                ))}
              </div>
            ) : persons.length === 0 ? (
              <div className="text-center py-20">
                <svg
                  className="w-16 h-16 mx-auto text-gray-300 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <p className="text-gray-500 mb-2">No people detected yet</p>
                <p className="text-sm text-gray-400">
                  Scan photos to detect faces.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
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
      </div>
    </div>
  );
}
