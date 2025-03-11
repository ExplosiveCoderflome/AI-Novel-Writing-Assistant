import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Loader2, Search, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format, isValid, parseISO } from 'date-fns';

interface Formula {
  id: string;
  name: string;
  genre?: string;
  style?: string;
  toneVoice?: string;
  createdAt: string;
  updatedAt: string;
}

interface FormulaListProps {
  onSelectFormula?: (formula: any) => void;
}

const FormulaList: React.FC<FormulaListProps> = ({ onSelectFormula }) => {
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFormula, setSelectedFormula] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formulaToDelete, setFormulaToDelete] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const loadFormulas = async () => {
    setIsLoading(true);
    try {
      const url = searchTerm
        ? `/api/writing-formula/list?search=${encodeURIComponent(searchTerm)}`
        : '/api/writing-formula/list';
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('加载公式列表失败');
      }
      const data = await response.json();
      if (data.success && data.data.formulas) {
        setFormulas(data.data.formulas);
      }
    } catch (error) {
      console.error('加载公式列表失败:', error);
      toast.error('加载公式列表失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFormulas();
  }, [searchTerm]);

  const handleViewFormula = async (id: string) => {
    try {
      const response = await fetch(`/api/writing-formula/detail/${id}`);
      if (!response.ok) {
        throw new Error('加载公式详情失败');
      }
      const data = await response.json();
      if (data.success && data.data) {
        setSelectedFormula(data.data);
        setIsDialogOpen(true);
        
        if (onSelectFormula) {
          onSelectFormula(data.data);
        }
      }
    } catch (error) {
      console.error('加载公式详情失败:', error);
      toast.error('加载公式详情失败，请重试');
    }
  };

  const handleDeleteFormula = async () => {
    if (!formulaToDelete) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/writing-formula/delete/${formulaToDelete}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '删除失败');
      }
      
      const result = await response.json();
      toast.success(result.message || '写作公式删除成功');
      
      // 重新加载公式列表
      loadFormulas();
    } catch (error) {
      console.error('删除写作公式失败:', error);
      toast.error(error instanceof Error ? error.message : '删除失败，请重试');
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
      setFormulaToDelete(null);
    }
  };

  const confirmDelete = (id: string) => {
    setFormulaToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const renderFormulaDetails = () => {
    if (!selectedFormula) return null;

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">基本信息</h3>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <Label>名称</Label>
              <div className="p-2 border rounded">{selectedFormula.name}</div>
            </div>
            <div>
              <Label>体裁</Label>
              <div className="p-2 border rounded">{selectedFormula.genre || '未指定'}</div>
            </div>
            <div>
              <Label>风格</Label>
              <div className="p-2 border rounded">{selectedFormula.style || '未指定'}</div>
            </div>
            <div>
              <Label>语气/声音</Label>
              <div className="p-2 border rounded">{selectedFormula.toneVoice || '未指定'}</div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium">结构与节奏</h3>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <Label>结构</Label>
              <div className="p-2 border rounded">{selectedFormula.structure || '未指定'}</div>
            </div>
            <div>
              <Label>节奏</Label>
              <div className="p-2 border rounded">{selectedFormula.pacing || '未指定'}</div>
            </div>
            <div>
              <Label>段落模式</Label>
              <div className="p-2 border rounded">{selectedFormula.paragraphPattern || '未指定'}</div>
            </div>
            <div>
              <Label>句式结构</Label>
              <div className="p-2 border rounded">{selectedFormula.sentenceStructure || '未指定'}</div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium">语言与表达</h3>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <Label>词汇水平</Label>
              <div className="p-2 border rounded">{selectedFormula.vocabularyLevel || '未指定'}</div>
            </div>
            <div>
              <Label>修辞手法</Label>
              <div className="p-2 border rounded">{selectedFormula.rhetoricalDevices || '未指定'}</div>
            </div>
            <div>
              <Label>叙事模式</Label>
              <div className="p-2 border rounded">{selectedFormula.narrativeMode || '未指定'}</div>
            </div>
            <div>
              <Label>视角</Label>
              <div className="p-2 border rounded">{selectedFormula.perspectivePoint || '未指定'}</div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium">主题与情感</h3>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <Label>角色声音</Label>
              <div className="p-2 border rounded">{selectedFormula.characterVoice || '未指定'}</div>
            </div>
            <div>
              <Label>主题</Label>
              <div className="p-2 border rounded">{selectedFormula.themes || '未指定'}</div>
            </div>
            <div>
              <Label>意象</Label>
              <div className="p-2 border rounded">{selectedFormula.motifs || '未指定'}</div>
            </div>
            <div>
              <Label>情感基调</Label>
              <div className="p-2 border rounded">{selectedFormula.emotionalTone || '未指定'}</div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium">源文本</h3>
          <div className="mt-2">
            <div className="p-2 border rounded whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {selectedFormula.sourceText || '未提供'}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium">独特特征</h3>
          <div className="mt-2">
            <div className="p-2 border rounded whitespace-pre-wrap">{selectedFormula.uniqueFeatures || '未指定'}</div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium">公式描述</h3>
          <div className="mt-2">
            <div className="p-2 border rounded whitespace-pre-wrap">{selectedFormula.formulaDescription || '未指定'}</div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium">应用步骤</h3>
          <div className="mt-2">
            <div className="p-2 border rounded whitespace-pre-wrap">{selectedFormula.formulaSteps || '未指定'}</div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium">应用技巧</h3>
          <div className="mt-2">
            <div className="p-2 border rounded whitespace-pre-wrap">{selectedFormula.applicationTips || '未指定'}</div>
          </div>
        </div>
      </div>
    );
  };

  /**
   * 安全地格式化日期，处理无效日期情况
   */
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    
    try {
      // 尝试解析 ISO 格式的日期字符串
      const date = parseISO(dateString);
      
      // 检查日期是否有效
      if (!isValid(date)) return '-';
      
      // 格式化有效日期
      return format(date, 'yyyy-MM-dd HH:mm');
    } catch (error) {
      console.error('日期格式化错误:', error);
      return '-';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>写作公式库</CardTitle>
        <CardDescription>
          管理您提取和保存的写作公式
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索公式..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button variant="outline" onClick={() => loadFormulas()}>
              刷新
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : formulas.length > 0 ? (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>体裁</TableHead>
                    <TableHead>风格</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formulas.map((formula) => (
                    <TableRow key={formula.id}>
                      <TableCell className="font-medium">{formula.name}</TableCell>
                      <TableCell>{formula.genre || '-'}</TableCell>
                      <TableCell>{formula.style || '-'}</TableCell>
                      <TableCell>
                        {formatDate(formula.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewFormula(formula.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => confirmDelete(formula.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              没有找到写作公式
            </div>
          )}
        </div>

        {/* 公式详情对话框 */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>写作公式详情</DialogTitle>
              <DialogDescription>
                查看写作公式的详细信息
              </DialogDescription>
            </DialogHeader>
            {renderFormulaDetails()}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 删除确认对话框 */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
                您确定要删除这个写作公式吗？此操作无法撤销。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                取消
              </Button>
              <Button variant="destructive" onClick={handleDeleteFormula} disabled={isDeleting}>
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    删除中...
                  </>
                ) : (
                  '确认删除'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default FormulaList; 