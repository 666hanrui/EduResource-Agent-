from __future__ import annotations

from app.services.generate_store import SQLiteGenerateStore


def test_generate_store_survives_new_instance(tmp_path) -> None:
    store_path = tmp_path / "generate_store.sqlite3"
    first = SQLiteGenerateStore(store_path)

    first.save("gen_001", {"document": {"title": "链表"}, "errors": {}})
    second = SQLiteGenerateStore(store_path)

    assert second.get("gen_001") == {"document": {"title": "链表"}, "errors": {}}
    assert second.load_all()["gen_001"]["document"]["title"] == "链表"
