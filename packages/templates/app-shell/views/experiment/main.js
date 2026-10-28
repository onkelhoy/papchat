import '@papchat/app-shell';

const created = document.getElementById("created");
const shell = document.createElement("pc-app-shell");
shell.sidebaropen = true;
for (const slot of ["header", "sidebar", "main"])
{
    const box = document.createElement("div");
    box.slot = slot;
    box.className = "box";
    box.textContent = `created ${slot}`;
    shell.append(box);
}
created.append(shell);

// the page's view of the shell state
for (const el of document.querySelectorAll("pc-app-shell"))
{
    el.addEventListener("sidebar-toggle", (e) => {
        document.getElementById("log").textContent = `sidebar-toggle: open = ${e.detail.open}`;
    });
}
