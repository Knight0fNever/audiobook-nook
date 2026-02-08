<script setup>
import { ref } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import FileUpload from 'primevue/fileupload'
import ProgressBar from 'primevue/progressbar'
import Message from 'primevue/message'
import { usePdfFollowAlongStore } from '../../stores/pdfFollowAlong'

const props = defineProps({
  visible: Boolean,
  bookId: Number,
  bookTitle: String
})

const emit = defineEmits(['update:visible', 'uploaded'])

const pdfStore = usePdfFollowAlongStore()
const uploading = ref(false)
const uploadError = ref(null)

async function handleUpload(event) {
  const file = event.files[0]
  if (!file) return

  uploading.value = true
  uploadError.value = null

  try {
    await pdfStore.uploadPdf(file)
    emit('uploaded')
    closeDialog()
  } catch (err) {
    uploadError.value = err.message || 'Failed to upload PDF'
  } finally {
    uploading.value = false
  }
}

function closeDialog() {
  uploadError.value = null
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="$emit('update:visible', $event)"
    header="Upload PDF for Follow-Along"
    :modal="true"
    :style="{ width: '500px' }"
    :closable="!uploading"
  >
    <div class="upload-content">
      <p class="upload-description">
        Upload a PDF version of <strong>{{ bookTitle }}</strong> to enable sentence-by-sentence
        highlighting synchronized with audio playback.
      </p>

      <Message v-if="uploadError" severity="error" :closable="false">
        {{ uploadError }}
      </Message>

      <FileUpload
        mode="basic"
        name="pdf"
        :accept="'application/pdf'"
        :maxFileSize="104857600"
        :auto="true"
        :customUpload="true"
        @uploader="handleUpload"
        :disabled="uploading"
        chooseLabel="Select PDF File"
        class="pdf-upload"
      />

      <div v-if="uploading" class="upload-progress">
        <ProgressBar mode="indeterminate" style="height: 6px" />
        <p>Uploading PDF...</p>
      </div>

      <div class="upload-notes">
        <h4>How it works:</h4>
        <ol>
          <li>Upload the PDF version of this audiobook</li>
          <li>The system will extract text and transcribe the audio</li>
          <li>Sentences are aligned between the PDF and audio</li>
          <li>Open the PDF player to see highlighted sentences as you listen</li>
        </ol>
        <p class="note">
          <i class="pi pi-info-circle"></i>
          Processing may take several minutes for long books.
          Scanned PDFs are not yet supported.
        </p>
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        severity="secondary"
        @click="closeDialog"
        :disabled="uploading"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.upload-content {
  padding: 1rem 0;
}

.upload-description {
  margin-bottom: 1.5rem;
  line-height: 1.5;
}

.pdf-upload {
  width: 100%;
  margin-bottom: 1rem;
}

.pdf-upload :deep(.p-button) {
  width: 100%;
}

.upload-progress {
  text-align: center;
  padding: 1rem;
}

.upload-progress p {
  margin-top: 0.5rem;
  color: var(--text-color-secondary);
}

.upload-notes {
  background: var(--surface-50);
  border-radius: 8px;
  padding: 1rem;
  margin-top: 1.5rem;
}

.upload-notes h4 {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
}

.upload-notes ol {
  margin: 0;
  padding-left: 1.25rem;
}

.upload-notes li {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-color-secondary);
}

.note {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-top: 1rem;
  font-size: 0.85rem;
  color: var(--text-color-secondary);
}

.note i {
  margin-top: 2px;
}
</style>
