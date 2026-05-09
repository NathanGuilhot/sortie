; Mirrors verbs from electron/src/main/shellContextMenu.ts and extensions
; from shared/src/constants.ts SUPPORTED_IMAGE_EXTENSIONS

!macro DeleteSortieImageVerbs EXT
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\SortieAddImagesToGallery"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\SortieAddToBoard"
!macroend

!macro customUnInstall
  ; Image extension verbs (mirror SUPPORTED_IMAGE_EXTENSIONS)
  !insertmacro DeleteSortieImageVerbs ".jpg"
  !insertmacro DeleteSortieImageVerbs ".jpeg"
  !insertmacro DeleteSortieImageVerbs ".png"
  !insertmacro DeleteSortieImageVerbs ".gif"
  !insertmacro DeleteSortieImageVerbs ".webp"
  !insertmacro DeleteSortieImageVerbs ".bmp"
  !insertmacro DeleteSortieImageVerbs ".tiff"
  !insertmacro DeleteSortieImageVerbs ".heic"
  !insertmacro DeleteSortieImageVerbs ".cr2"
  !insertmacro DeleteSortieImageVerbs ".cr3"
  !insertmacro DeleteSortieImageVerbs ".crw"
  !insertmacro DeleteSortieImageVerbs ".nef"
  !insertmacro DeleteSortieImageVerbs ".nrw"
  !insertmacro DeleteSortieImageVerbs ".arw"
  !insertmacro DeleteSortieImageVerbs ".sr2"
  !insertmacro DeleteSortieImageVerbs ".srf"
  !insertmacro DeleteSortieImageVerbs ".raf"
  !insertmacro DeleteSortieImageVerbs ".orf"
  !insertmacro DeleteSortieImageVerbs ".rw2"
  !insertmacro DeleteSortieImageVerbs ".pef"
  !insertmacro DeleteSortieImageVerbs ".dng"
  !insertmacro DeleteSortieImageVerbs ".raw"

  ; Folder verbs
  DeleteRegKey HKCU "Software\Classes\Directory\shell\SortieAddFolderToGallery"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\SortieAddFolderToBoard"

  ; sortie:// protocol handler (set via app.setAsDefaultProtocolClient)
  DeleteRegKey HKCU "Software\Classes\sortie"

  ; Optional: wipe per-user library/settings/caches
  MessageBox MB_YESNO|MB_ICONQUESTION "Also delete your Sortie library, settings, and caches in %APPDATA%\Sortie?$\n$\nChoose No to keep them for a future reinstall." /SD IDNO IDNO skip_userdata
    RMDir /r "$APPDATA\Sortie"
  skip_userdata:
!macroend
