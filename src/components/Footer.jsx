export default function Footer() {
  return (
    <footer className="max-w-4xl mx-auto px-4 py-6 flex flex-col items-center gap-2">
      <a href="https://jcginfotech.net.py" target="_blank" rel="noreferrer">
        <img
          src="/jcg-logo-footer.png"
          srcSet="/jcg-logo-footer.png 1x, /jcg-logo-footer@2x.png 2x"
          alt="JCG InfraTech"
          className="h-5 w-auto object-contain opacity-80 hover:opacity-100 transition"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      </a>
      <a
        href="https://jcginfotech.net.py"
        target="_blank"
        rel="noreferrer"
        className="text-xs text-muted hover:text-primary transition"
      >
        Desarrollado por <span className="font-medium">JCG Infotech</span> · jcginfotech.net.py
      </a>
    </footer>
  )
}
