export const baseTemplate = (title: string, content: string) => `
  <div style="background:#f4f6f8; padding:20px; font-family:Arial;">
    <div style="max-width:600px; margin:auto; background:#fff; border-radius:10px; overflow:hidden;">
      
      <div style="background:#0f172a; color:#fff; padding:20px; text-align:center;">
        <h2>My App</h2>
      </div>

      <div style="padding:30px;">
        <h3>${title}</h3>
        ${content}
      </div>

      <div style="background:#f1f5f9; padding:15px; text-align:center; font-size:12px;">
        © ${new Date().getFullYear()} My App
      </div>

    </div>
  </div>
`;
