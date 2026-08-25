# Deploy ke Render

1. Buat repository GitHub dan upload seluruh project.
2. Di Render pilih **New > Blueprint** lalu hubungkan repository.
3. Render akan membaca `render.yaml`.
4. Isi `ADMIN_USERNAME` dan `ADMIN_PASSWORD` saat diminta.
5. Tunggu deploy selesai, lalu buka URL `https://katalog-app.onrender.com` yang diberikan Render.

Customer menggunakan URL utama `/`. Area admin berada di `/admin` dan tetap memerlukan login.

## Catatan penyimpanan

Produk dan foto saat ini disimpan di filesystem aplikasi melalui `data/products.json` dan `public/uploads/`. Pada paket Render Free, file dapat kembali ke kondisi awal setelah redeploy atau restart. Untuk data permanen, gunakan persistent disk berbayar atau pindahkan storage ke layanan database/object storage.
