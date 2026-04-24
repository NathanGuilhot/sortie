import { useEffect, useRef, useState } from 'react';
import type { Face, Image, Person } from 'shared';
import { MetadataModal } from './MetadataModal';
import { buildFaceThumbUrl } from './faceThumb';
import { ChevronLeftIcon, XIcon } from './icons';
import { usePeopleStore } from '../stores/peopleStore';

interface PeoplePersonDetailProps {
  person: Person;
  onClose: () => void;
  onStartMerge: () => void;
}

export function PeoplePersonDetail({
  person,
  onClose,
  onStartMerge,
}: PeoplePersonDetailProps) {
  const { personImages, renamePerson, deletePerson, fetchPersonImages } = usePeopleStore();
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(person.name || '');
  const [faces, setFaces] = useState<Face[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedImage, setSelectedImage] = useState<Image | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  if (selectedImage && !personImages.some((image) => image.id === selectedImage.id)) {
    setSelectedImage(null);
  }

  /* eslint-disable react-hooks/set-state-in-effect -- intentional reset on prop change */
  useEffect(() => {
    setNameInput(person.name || '');
    setConfirmDelete(false);
    void fetchPersonImages(person.id);
  }, [person.id, person.name, fetchPersonImages]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const loadFaces = async () => {
      const allFaces: Face[] = [];
      for (const image of personImages) {
        const imageFaces = await window.sortieAPI.getImageFaces(image.id);
        allFaces.push(...imageFaces.filter((face) => face.person_id === person.id));
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSaveName();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={nameRef}
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
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
            Merge into
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
              onClick={() => {
                setConfirmDelete(true);
              }}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {faces.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Detected Faces</h3>
          <div className="flex flex-wrap gap-3">
            {faces.map((face) => (
              <PeopleFaceThumbnail key={face.id} face={face} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {personImages.map((image) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setSelectedImage(image)}
            className="aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity"
          >
            <img
              src={`sortie-thumb://${image.file_path}?w=300`}
              alt={image.file_name}
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
          onNavigate={(image) => setSelectedImage(image)}
        />
      )}
    </div>
  );
}

function PeopleFaceThumbnail({ face }: { face: Face }) {
  const { splitFace } = usePeopleStore();
  const [hover, setHover] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-200">
        <img src={buildFaceThumbUrl(face, 100)} alt="face" className="w-full h-full object-cover" />
      </div>
      {hover && (
        <button
          onClick={() => void splitFace(face.id)}
          className="absolute -top-1.5 -right-1.5 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
          title="Split from this person"
        >
          <XIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
