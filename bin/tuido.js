#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "fs";
import dotenv from "dotenv";
import blessed from "blessed";

dotenv.config();
const DB_FILE = process.env.DB_FILE || "./tasks.json";

function loadData() {
    if (!existsSync(DB_FILE)) return {};
    try {
        return JSON.parse(readFileSync(DB_FILE, "utf-8"));
    } catch {
        return {};
    }
}
function saveData(data) {
    writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}
function addCategory(name) {
    const data = loadData();
    if (!data[name]) data[name] = [];
    saveData(data);
}
function removeCategory(name) {
    const data = loadData();
    if (data[name]) {
        delete data[name];
        saveData(data);
        return true;
    }
    return false;
}
function addTask(category, text) {
    text = text.replace(/^["']|["']$/g, "");
    const data = loadData();
    if (!data[category]) data[category] = [];
    data[category].push({ text, done: false });
    saveData(data);
}
function doneTaskToggle(category, index) {
    const data = loadData();
    if (data[category] && data[category][index]) {
        data[category][index].done = !data[category][index].done;
        saveData(data);
        return data[category][index].text;
    }
    return null;
}
function removeTask(category, index) {
    const data = loadData();
    if (data[category] && data[category][index]) {
        const removed = data[category].splice(index, 1);
        saveData(data);
        return removed[0].text;
    }
    return null;
}

const screen = blessed.screen({ smartCSR: true, title: "TUIDO" });

const catList = blessed.list({
    parent: screen,
    top: 0,
    left: 0,
    width: "25%",
    height: "100%-1",
    keys: true,
    vi: true,
    label: "Categories",
    border: "line",
    style: {
        selected: { bg: "blue", fg: "white" },
        item: { fg: "white", bg: "black" },
        focus: { border: { fg: "blue" } },
    },
});

const taskList = blessed.list({
    parent: screen,
    top: 0,
    left: "25%",
    width: "75%",
    height: "100%-1",
    keys: true,
    vi: true,
    label: "Tasks",
    border: "line",
    style: {
        selected: { bg: "black", fg: "white" },
        item: { fg: "white", bg: "black" },
        focus: { border: { fg: "blue" }, selected: { bg: "blue", fg: "white" } },
    },
    tags: true,
    scrollable: true,
    alwaysScroll: true,
});

const footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    style: { fg: "white", bg: "black" },
});

let footerTimeout = null;
let categories = [];
let selectedCategoryIndex = 0;
let lastTaskIndex = 0;

function showFooter(msg, isError = false) {
    footer.setContent(msg);
    footer.style = isError
        ? { fg: "white", bg: "red", bold: true }
        : { fg: "yellow", bg: "black", bold: true };
    screen.render();
    if (footerTimeout) clearTimeout(footerTimeout);
    footerTimeout = setTimeout(() => showFooterTips(), 2000);
}

function showFooterTips() {
    if (screen.focused === catList)
        footer.setContent("[a] Add  [d] Delete  [Tab] Tasks  [q] Exit");
    else
        footer.setContent(
            "[a] Add  [x] Done  [d] Delete  [Enter] Toggle  [Tab] Categories  [q] Exit"
        );
    footer.style = { fg: "white", bg: "black" };
    screen.render();
}

function renderCategories(actionMsg = "") {
    const data = loadData();
    categories = Object.keys(data);
    const items = categories.map((cat) => {
        const tasks = data[cat] || [];
        const done = tasks.filter((t) => t.done).length;
        return `${cat} [${done}/${tasks.length}]`;
    });
    catList.setItems(items.length ? items : ["No categories"]);
    if (selectedCategoryIndex >= categories.length) selectedCategoryIndex = categories.length - 1;
    if (selectedCategoryIndex < 0) selectedCategoryIndex = 0;
    catList.select(selectedCategoryIndex);
    renderTasks(categories[selectedCategoryIndex]);
    actionMsg ? showFooter(actionMsg) : showFooterTips();
}

function renderTasks(category) {
    if (!category) {
        taskList.setItems([]);
        screen.render();
        return;
    }
    const tasks = loadData()[category] || [];
    const items = tasks.map((t, idx) =>
        t.done ? `[{green-fg}x{/green-fg}] ${t.text}` : `[ ] ${t.text}`
    );
    taskList.setItems(items.length ? items : ["No tasks"]);
    const idx = Math.min(lastTaskIndex, items.length - 1);
    taskList.select(idx >= 0 ? idx : 0);
    screen.render();
}

catList.on("select item", (_, idx) => {
    selectedCategoryIndex = idx;
    renderTasks(categories[selectedCategoryIndex]);
});

screen.key(["a"], () => {
    if (screen.focused === catList) {
        const prompt = blessed.prompt({
            parent: screen,
            left: "center",
            top: "center",
            width: "50%",
            height: 7,
            border: "line",
            label: "Add category",
        });
        prompt.input("Category name:", "", (err, value) => {
            if (value) addCategory(value), renderCategories(`Category "${value}" added`);
            else showFooter("Empty category name", true);
        });
    } else if (screen.focused === taskList) {
        const prompt = blessed.prompt({
            parent: screen,
            left: "center",
            top: "center",
            width: "50%",
            height: 7,
            border: "line",
            label: "Add task",
        });
        prompt.input("Task name:", "", (err, value) => {
            if (value)
                addTask(categories[selectedCategoryIndex], value),
                    (lastTaskIndex = categories[selectedCategoryIndex].length - 1),
                    renderTasks(categories[selectedCategoryIndex]),
                    showFooter(`Task "${value}" added`),
                    renderCategories();
            else showFooter("Empty task name", true);
        });
    }
});

screen.key(["d", "delete", "backspace"], () => {
    if (screen.focused === catList) {
        const catName = categories[selectedCategoryIndex];
        if (!catName) return showFooter("No category selected", true);
        const q = blessed.question({
            parent: screen,
            left: "center",
            top: "center",
            width: "50%",
            height: 7,
            border: "line",
            label: "Confirm delete",
        });
        q.ask(`Delete category "${catName}"? (y/n)`, (err, ok) => {
            if (ok) removeCategory(catName), renderCategories(`Category "${catName}" deleted`);
        });
    } else if (screen.focused === taskList) {
        const idx = taskList.selected;
        lastTaskIndex = idx;
        const taskText = removeTask(categories[selectedCategoryIndex], idx);
        taskText
            ? renderTasks(categories[selectedCategoryIndex])
            : showFooter("No task selected", true);
        renderCategories();
    }
});

screen.key(["x"], () => {
    if (screen.focused === taskList) {
        const idx = taskList.selected;
        lastTaskIndex = idx;
        const taskText = doneTaskToggle(categories[selectedCategoryIndex], idx);
        taskText
            ? renderTasks(categories[selectedCategoryIndex])
            : showFooter("No task selected", true);
        renderCategories();
    }
});

screen.key(["enter"], () => {
    if (screen.focused === taskList) {
        const idx = taskList.selected;
        lastTaskIndex = idx;
        const taskText = doneTaskToggle(categories[selectedCategoryIndex], idx);
        taskText
            ? renderTasks(categories[selectedCategoryIndex])
            : showFooter("No task selected", true);
        renderCategories();
    }
});

screen.key(["tab"], () => {
    screen.focused === catList ? taskList.focus() : catList.focus();
    showFooterTips();
});
screen.key(["q", "C-c"], () => process.exit(0));

catList.focus();
renderCategories();
